// In your Electron renderer process's main JS file (e.g., renderer.js)
import AutoHyperlink from './path/to/auto-hyperlink'; // Adjust path

// If using Tippy.js, import its CSS too:
// import 'tippy.js/dist/tippy.css'; // Basic theme
// import 'tippy.js/animations/scale.css'; // Optional animation

document.addEventListener('DOMContentLoaded', () => {
    const autoLinker = new AutoHyperlink({
        definitionApiUrl: 'http://localhost:3001/api/definition', // Your backend API URL
        keywords: ["大模型", "机器学习", "前端", "Electron", "AI"] // Optional: override or extend keywords
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
        definitionApiUrl: 'http://localhost:3001/api/definition', // Your backend API URL
        keywords: ["大模型", "机器学习", "NodeJS", "Web应用"] // Adjust keywords
    });

    // Start observing changes in the document body or a specific content area
    autoLinker.observe(document.getElementById('article-content') || document.body);
});