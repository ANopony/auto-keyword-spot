class AutoLinker {
    constructor(config) {
      this.keywordMap = config.keywordMap || {};
      this.observer = null;
      this.init();
    }
  
    // 初始化监听
    init() {
      this.scanAndReplace(document.body);
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanAndReplace(node);
            }
          });
        });
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  
    // 核心替换逻辑
    scanAndReplace(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (textNode.parentNode.tagName === 'A' || textNode.parentNode.closest('pre, code')) {
          continue;
        }
        let newHTML = textNode.textContent;
        Object.entries(this.keywordMap).forEach(([keyword, url]) => {
          const regex = new RegExp(`\\b${keyword}\\b`, 'gi'); // 精确匹配单词边界
          newHTML = newHTML.replace(regex, `<a href="${url}" class="auto-link">${keyword}</a>`);
        });
        if (newHTML !== textNode.textContent) {
          const wrapper = document.createElement('span');
          wrapper.innerHTML = newHTML;
          textNode.parentNode.replaceChild(wrapper, textNode);
        }
      }
    }
  
    // 动态更新关键词
    updateKeywords(newKeywords) {
      this.keywordMap = { ...this.keywordMap, ...newKeywords };
      this.scanAndReplace(document.body); // 立即重新扫描
    }
}
  
// 开发者使用示例
const linker = new AutoLinker({
keywordMap: {
    "JS": "https://example.com/js",
    "DOM操作": "https://example.com/dom"
}
});
// 当AI返回新内容时，自动触发替换
