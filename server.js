const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser'); // 用于解析 JSON 请求体
const app = express();
const port = 943;

app.use(cors()); // 允许跨域请求
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

async function pleaseLLM(text) {
  console.log(`[pleaseLLM] Received text: "${text.substring(0, Math.min(text.length, 100))}..."`);

//   try {
//     const response = await fetch('http://localhost:16688/api/llm', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({ text })
//     });
//     const content = response.data;
//     return content;
//   } catch (error) {
//     console.error(`[pleaseLLM] Error: ${error.message}`);
//     return {};
//   }
  const keywords = {};
  if (text.includes("大模型")) {
    keywords["大模型"] = {
      description: "指具有庞大参数量和复杂结构的人工智能模型，通常通过海量数据训练，能处理多种复杂任务。",
      link: "https://zh.wikipedia.org/wiki/%E5%A4%A7%E5%9E%8B%E8%AF%AD%E8%A8%80%E6%A8%A1%E5%9E%8B"
    };
  }
  if (text.includes("机器学习")) {
    keywords["机器学习"] = {
      description: "人工智能的一个分支，通过算法使计算机从数据中学习，无需明确编程。",
      link: "https://zh.wikipedia.org/wiki/%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0"
    };
  }
  return keywords;
}

app.post('/api/extract_keywords', async (req, res) => {
    const { text } = req.body;
    console.log(`[API] Extracting keywords from text: "${text.substring(0, Math.min(text.length, 100))}..."`);
    
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Invalid input text' });
    }
    
    try {
        const keywords = await pleaseLLM(text);
        console.log(`[API] Extracted keywords: ${JSON.stringify(keywords)}`);
        res.json(keywords);
    } catch (error) {
        console.error(`[API] Error extracting keywords: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }

});

app.listen(port, () => {
    console.log(`大模型关键词提取 API 监听在 http://localhost:${port}`);
});