const cors = require('cors')
const cheerio = require('cheerio');
const getURLs = require('get-urls');
const fetch = require('node-fetch');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const randomUseragent = require('random-useragent');
const { Cluster } = require('puppeteer-cluster');


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(5000, () => {
    console.log("Listening on port 5000");
})

const delay = (time) => {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
}

const chunk = (arr, chunkSize) => {
    let temp = [];
    for(let i = 0; i < arr.length; i+=chunkSize) {
        temp.push(arr.slice(i, i+chunkSize));
    }
    return temp;
}

const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-features=NetworkService',
    '--deterministic-fetch',
    "--proxy-server='direct://'",
    '--proxy-bypass-list=*',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--window-size=1920x1080',
    '--hide-scrollbars',
];

const scrapeStatus = (text) => {
    const requests = urls.map(async (url, index) => {
        const browser = await puppeteer.launch({ headless: true, args: puppeteerArgs });
        const page = await browser.newPage();
        await page.setUserAgent(randomUseragent.getRandom());
        await console.log(`Currently at ${index} / ${urls.length} `)
        await page.goto(url, { waitUntil : "networkidle0" } )
            .then(() => console.log("Page loaded"))
            .catch(err => console.log("Page goto: ", err))
        // await page.waitForSelector('.error-info');
        await page.screenshot({path: `./screenshot/result-start-${new Date().getTime()}.png`})
            .then(() => console.log("Screenshot available now"))
            .catch(err => console.log("Page Screenshot: ", err))

        //If capcha is detected
        let capcha = await page.$('#block-lzd-page-title')
        if (capcha) {
            console.log("Capcha found")
            let sliderWrapper = await page.$('.nc_scale');
            let wrapper = await sliderWrapper.boundingBox();
            let sliderHandle = await page.$('#nc_2_n1z');
            let handle = await sliderHandle.boundingBox();

            console.log("Solving Capcha")
            await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height /2);
            await page.mouse.down();
            await page.screenshot({path: `./screenshot/result-capcha-start-${new Date().getTime()}.png`})
            await page.mouse.move(handle.x + wrapper.width, handle.y + handle.height / 2, { steps: 10 });
            // await page.mouse.up();
            await page.screenshot({path: `./screenshot/result-capcha-end-${new Date().getTime()}.png`})
            // await page.screenshot({path: `./screenshot/result-capcha-finish-${new Date().getTime()}.png`})
            await delay(1000);
            await page.screenshot({path: `./screenshot/result-finish-${new Date().getTime()}.png`})
            console.log("Screenshot available now");
        }
        let error = await page.$('.error-info')
        const errorContent = await error ? await page.evaluate((url) => {
            const errorContainer = document.querySelector('.error-info')
            const errorMessage = errorContainer.querySelector("h3").innerHTML;
            return errorMessage
        }).catch(err => console.log("Page Evaluate: ", err)) : null;
        let data = await {};
        data["url"] = await page.url();
        data["status"] = await error ? false : true;
        console.log(data);  
        await page.close();
        await browser.close();
        console.log("Closing browser");
        return data;
    })
    return Promise.all(datas);
}


const scrapeStatusWithCluster = async(urls) => {
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 4,
        puppeteerOptions: {
            args: puppeteerArgs,
            headless: true,
        },
        monitor: true
    });
    const requests = [];

    await cluster.task(async({ page, data: url }) => {
        await page.goto(url);
        await page.setUserAgent(randomUseragent.getRandom());
        const pageTitle = await page.evaluate(() => document.title);
        const available = pageTitle.indexOf("non-existent products");
        console.log(`${url} - finished`);
        return requests.push({ url, status: available < 0 ? true : false });

    })

    // const urls = Array.from(getURLs(text));
    urls.map((url) => cluster.queue(url));

    await cluster.idle();
    await cluster.close();

    return requests;
}

app.post("/", async (req, res) => {
    const body = req.body;
    // const chunk = 36;
    // const chunkedArray = [];
    const urls = Array.from(getURLs(body.text));
    const parsed = chunk(urls, 36);
    let data = [];
    console.log(parsed)

    for(let arr of parsed) {
        data = [...data, ...await scrapeStatusWithCluster(arr)];
    }
    await res.json({
        status: "finished",
        data
    });
})