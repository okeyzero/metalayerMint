import axios from "axios";
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import fs from "fs";
import pLimit from 'p-limit';
import {ethers} from "ethers";
import Logger from "@youpaichris/logger";
import path from "path";
import {fileURLToPath} from 'url';
import * as dotenv from "dotenv";
import captcha from "./yesCaptcha.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url)
const logger = new Logger(path.basename(__filename));
const successPath = "success.txt";
const failPath = "fail.txt";
const yes_clientkey = process.env.YES_CLIENTKEY;
const UserToken = process.env.USERTOKEN;
let useYesCaptcha = false;
//UserToken 如果为空 yes_clientkey 不为空 则使用yes_clientkey
if (!UserToken && yes_clientkey) {
    logger.info("UserToken 为空 使用 yes_clientkey")
    useYesCaptcha = true;
} else if (UserToken) {
    logger.info("UserToken 不为空 使用 UserToken")
} else {
    logger.error("UserToken 和 yes_clientkey 都为空")
    process.exit(1)
}
const thread = parseInt(process.env.THREAD) || 1;

const allProxy = fs.readFileSync("proxys.txt", "utf-8").split("\n")
logger.info(`代理总数 ${allProxy.length}`)


async function mint(client, address, signature, turnstileToken) {
    const response = await client.post(
        'https://metalayer.caldera.xyz/api/trpc/mint.mint',
        {
            '0': {
                'json': {
                    'address': address,
                    'signature': signature,
                    'turnstileToken': turnstileToken
                }
            }
        },
        {
            params: {
                'batch': '1'
            },
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Origin': 'https://metalayer.caldera.xyz',
                'Pragma': 'no-cache',
                'Referer': 'https://metalayer.caldera.xyz/mint',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'content-type': 'application/json',
                'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'trpc-accept': 'application/jsonl',
                'x-trpc-source': 'nextjs-react'
            }
        }
    );
    return response.data;
}

async function get_request_token() {
    const proxy = allProxy[Math.floor(Math.random() * allProxy.length)]
    const url = "http://api.nocaptcha.io/api/wanda/cloudflare/universal"
    const data = {
        "href": "https://metalayer.caldera.xyz/mint",
        "proxy": proxy,
        "sitekey": "0x4AAAAAAAft2frgHoEZW9zt",
        "explicit": true
    }
    const response = await axios.post(
        url,
        data,
        {
            headers: {
                'User-Token': UserToken,
                'Content-Type': 'application/json',
                'Developer-Id': 'hLf08E',
            },
            timeout: 120000
        }
    );
    // console.log(response.data)
    return response.data;

}

async function get_request_token_yes(pageAction) {
    // const proxy = allProxy[Math.floor(Math.random() * allProxy.length)]
    const task = await captcha.createTask(
        "https://metalayer.caldera.xyz/mint",
        "0x4AAAAAAAft2frgHoEZW9zt",
        "TurnstileTaskProxyless",
        yes_clientkey,
        // proxy
    );
    if (!task.taskId) {
        logger.debug(`${pageAction} 任务创建失败 ${JSON.stringify(task)}`)
        throw new Error(`${pageAction} 任务创建失败`);
    }
    const result = await captcha.getTaskResult(task.taskId, yes_clientkey);
    if (!result) {
        throw new Error(`${pageAction} 人机验证失败`);
    }
    const {token} = result.solution;
    return token;
}

async function mintNft(privateKey) {
    const jar = new CookieJar();
    const client = wrapper(axios.create({jar}));
    const wallet = new ethers.Wallet(privateKey);
    const myAddress = wallet.address;

    const message = "I, ".concat(myAddress, ", am ready to enter the Caldera Metalayer.")
    const signature = await wallet.signMessage(message);

    let requestToken;
    for (let i = 0; i < 100; i++) {
        try {
            logger.debug(`${myAddress} get request token... `)
            let response;
            if (useYesCaptcha) {
                response = await get_request_token_yes("TurnstileTaskS2")
                requestToken = response
            } else {
                response = await get_request_token()
                requestToken = response?.data?.token
            }
            if (requestToken) {
                break
            } else {
                logger.error(`${myAddress} get request token failed ${JSON.stringify(response)}`)
            }
        } catch (e) {
            console.error(e)
        }
    }

    if (!requestToken) {
        logger.error(`${myAddress} get request token failed`)
        fs.appendFileSync(
            failPath,
            `${myAddress}----${privateKey}\n`
        );
        return
    }

    for (let i = 0; i < 5; i++) {
        try {
            const request = await mint(client, myAddress, signature, requestToken)
            // console.log(JSON.stringify(request, null, 2))
            logger.info(`${myAddress}  ${JSON.stringify(request, null, 2)}`)
            if (request) {
                break
            }
        } catch (e) {
            // console.error(`Error Status: ${e?.response?.status}`);
            // console.error('Error Response:', JSON.stringify(e?.response?.data));

            logger.error(`${myAddress} Error Status:  ${e?.response?.status} Error Response: ${JSON.stringify(e?.response?.data)}`)
            //如果 max mints 在 e?.response?.data 的内容里 失败
            if (JSON.stringify(e?.response?.data).includes("error")) {
                fs.appendFileSync(
                    failPath,
                    `${myAddress}----${privateKey}\n`
                );
                return
            }

        }
    }
    fs.appendFileSync(
        successPath,
        `${myAddress}----${privateKey}\n`
    );
    logger.success(`${myAddress} mint success`)

}

async function main() {
    //读取keys.txt
    const keys = fs
        .readFileSync('keys.txt', "utf8")
        .split(/\r?\n/)
        .filter((key) => key);

    const successAddress = fs
        .readFileSync(successPath, "utf8")
        .split(/\r?\n/)
        .filter((key) => key)
        .map((key) => key.split("----")[0].toLocaleLowerCase());

    const limit = pLimit(thread);
    const tasks = keys.map((key) => {
        const [address, privateKey] = key.split('----');
        if (successAddress.includes(address.toLocaleLowerCase())) {
            logger.info(`${address} 已经领取过了`);
            return
        }
        return limit(() => mintNft(privateKey));
    });

    await Promise.all(tasks);

    logger.success("done");
}

main().catch(
    (e) => console.error(e)
)
