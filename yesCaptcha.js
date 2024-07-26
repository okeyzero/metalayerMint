import axios from "axios";


// 睡眠函数
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createTask(websiteUrl, websiteKey, taskType, clientKey, proxy = undefined) {
    const url = "https://api.yescaptcha.com/createTask";
    const params = {
        clientKey: clientKey,
        task: {
            websiteURL: websiteUrl,
            websiteKey: websiteKey,
            type: taskType,
            proxy: proxy,
        },
        softID: 16770,
    };
    const response = await axios.post(url, params);
    return response.data;
}

// 获取验证码结果
async function getTaskResult(taskId, clientKey, maxRetries = 30) {
    const url = "https://api.yescaptcha.com/getTaskResult";
    const params = {
        clientKey: clientKey,
        taskId: taskId,
    };
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const response = await axios.post(url, params);
            if (response.data.status === "ready") {
                return response.data;
            } else if (response.data.status === "processing") {
                await sleep(200); // 200 毫秒后再次检查
                attempts++;
            } else {
                console.error("Unexpected status:", response.data.status);
            }
        } catch (error) {
            console.error("Error fetching task result:", error);
        }
    }
    throw new Error("Max retries reached");
}

const captcha = {createTask, getTaskResult};
// ES6 默认导出
export default captcha;
// CommonJS 导出
// module.exports = captcha;