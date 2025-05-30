const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 506;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const upload = multer({ dest: 'uploads/' });

// 读取本地文件内容（txt, docx）
app.post('/api/read-file', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        let content = '';
        if (file.mimetype === 'text/plain') {
            content = fs.readFileSync(file.path, 'utf-8');
        } else if (file.originalname.endsWith('.docx')) {
            // 解析 docx
            const docx = require('docx-parser');
            content = await new Promise((resolve, reject) => {
                docx.parseDocx(file.path, (data) => resolve(data));
            });
        } else {
            return res.status(400).json({ error: 'Unsupported file type' });
        }

        fs.unlinkSync(file.path); // 删除临时文件
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Web demo server running at http://localhost:${port}`);
});