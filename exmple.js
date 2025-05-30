// In your Electron renderer process's main JS file (e.g., renderer.js)
const AutoHyperlink = require("auto-keyword-spot"); // Adjust path

// If using Tippy.js, import its CSS too:
// import 'tippy.js/dist/tippy.css'; // Basic theme
// import 'tippy.js/animations/scale.css'; // Optional animation

document.addEventListener('DOMContentLoaded', () => {
    const autoLinker = new AutoHyperlink({
        definitionApiUrl: 'http://localhost:506/api/extract_keywords', // Your backend API URL
        debounceDelay: 700 // Debounce delay in milliseconds
    });

    // Start observing changes in the document body or a specific container
    autoLinker.observe(document.getElementById('chat-container') || document.body);

    // For cleanup (optional, but good practice if app has a shutdown hook)
    window.addEventListener('beforeunload', () => {
        autoLinker.destroy();
    });
});


// In your Web app's client-side JavaScript (e.g., public/js/main.js)
import AutoHyperlink from './path/to/auto-hyperlink'; // Adjust path relative to your web root

document.addEventListener('DOMContentLoaded', () => {
    const autoLinker = new AutoHyperlink({
        definitionApiUrl: 'http://localhost:506/api/extract_keywords', // Your backend API URL
        debounceDelay: 700 // Debounce delay in milliseconds
    });

    // Start observing changes in the document body or a specific content area
    autoLinker.observe(document.getElementById('article-content') || document.body);
});

// TODO: 找专业的模型
// TODO: 只标注第一个重复的关键词
// TODO: 只匹配关键词
// TODO: 优化 system prompt
// TODO: 为不同知识储备的用户提供个性化的 prompt 以提取不同领域的关键词
// TODO: 结合知识库搜索关键词和模型识别关键词
// TODO: 在用户的机器上启动 server
// TODO: 集成 MCP