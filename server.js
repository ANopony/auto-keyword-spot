const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser'); // 用于解析 JSON 请求体
const app = express();
const port = 943;

app.use(cors()); // 允许跨域请求
app.use(bodyParser.json()); // 解析 JSON 请求体

async function pleaseLLM(text) {
  console.log(`[pleaseLLM] Received text: "${text.substring(0, Math.min(text.length, 100))}..."`);

  try {
    const response = await fetch('http://localhost:16688/api/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    const content = response.data;
    return content;
  } catch (error) {
    console.error(`[pleaseLLM] Error: ${error.message}`);
    return {};
  }
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