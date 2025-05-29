const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios'); // 新增

const app = express();
const port = 943;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

async function pleaseLLM(text) {
  console.log(`[pleaseLLM] Received text: "${text.substring(0, Math.min(text.length, 100))}..."`);

  try {
    const request = {
      model: "qwen2.5:1.5b",
      messages: [
        {
          "role": "system",
          "content": `你是一个专业的文本分析助手。请从以下文本中提取关键技术词汇、概念或专有名词（例如"大模型", "DOM", "机器学习", "Transformer", "神经网络"等），并为每个词汇提供一个简洁的解释和一个相关的外部链接（如果有）。
            请直接以标准 JSON 对象格式返回，格式如下：
            {
              "关键词1": {"description": "解释", "link": "链接"},
              "关键词2": {"description": "解释", "link": "链接"}
            }
            不要输出 markdown 代码块，不要输出数组，也不要输出多余的文字。`
        },
        { "role": "user", "content": text }
      ],
      stream: false,
    };

    const response = await axios.post(
      'http://127.0.0.1:16688/aog/v0.3/services/chat',
      request,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const result = response.data;
    console.info(`[pleaseLLM] Response received: ${JSON.stringify(result)}`);
    const content = result.message.content;
    console.info(`[pleaseLLM] Content extracted: ${content}`);
    if (!content) return {};
    let keywords;
    try {
      keywords = JSON.parse(content);
    } catch (e) {
      console.error('JSON parse error:', e, content);
      return {};
    }
    return keywords;
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