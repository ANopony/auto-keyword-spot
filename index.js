import { createPopper } from '@popperjs/core';
// 如果使用 Tippy.js，则导入其库及 CSS

function injectCSS(css) {
  if (document.head.querySelector('#auto-hyperlink-styles')) {
    return; // 避免重复注入
  }
  const style = document.createElement('style');
  style.id = 'auto-hyperlink-styles'; // 添加 ID 方便查找
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

let currentTooltip = null;
let currentPopper = null;

// 把 content 显示在提示框
function showTooltip(element, content) {
  if (currentTooltip) {
    hideTooltip();
  }

  // 创建一个提示框到原本的 document.body 中
  currentTooltip = document.createElement('div');
  currentTooltip.className = 'auto-hyperlink-tooltip';
  currentTooltip.innerHTML = content;
  document.body.appendChild(currentTooltip);

  // 等待 tooltip 元素被添加到 DOM 后再创建 Popper 实例
  requestAnimationFrame(() => {
    currentPopper = createPopper(element, currentTooltip, {
      placement: 'top',
      modifiers: [{
        name: 'offset',
        options: {
          offset: [0, 8],
        },
      }, {
        name: 'preventOverflow',
        options: {
          padding: 5,
        },
      }],
    });
    currentTooltip.classList.add('visible'); // 添加可见类以触发 CSS 过渡
  });
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.classList.remove('visible'); // 移除可见类以触发 CSS 过渡
    // 等待动画结束后再移除元素
    currentTooltip.addEventListener('transitionend', () => {
      if (currentPopper) {
        currentPopper.destroy();
        currentPopper = null;
      }
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }
    }, { once: true }); // 只监听一次
  }
}

class AutoHyperlink {
  constructor(options = {}) {
    this.llmApiUrl = options.llmApiUrl || 'http://localhost:943/api/extract_keywords';
    this.cache = new Map();                   // 缓存 LLM 响应，{文本块：值}
    this.processedElements = new WeakSet();   // 已处理的 DOM 元素
    this.pendingTextNodes = new Map();        // 待处理的文本节点及其父元素
    this.processingTimeout = null;            // 用于防抖的定时器
    this.observer = null;
    this.initialized = false;
    this.debounceDelay = options.debounceDelay || 500; // 防抖延迟

    // 注入一次 CSS
    injectCSS(`
      .auto-hyperlink-link {
          color: #1a73e8;
          text-decoration: underline dotted;
          cursor: pointer;
          position: relative;
      }

      .auto-hyperlink-tooltip {
          background-color: #333;
          color: #fff;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          z-index: 10000;
          max-width: 250px;
          word-wrap: break-word;
          opacity: 0;
          transition: opacity 0.2s ease-in-out; /* 更快的过渡 */
          pointer-events: none;
          position: absolute; /* Popper.js 会管理定位 */
      }
      .auto-hyperlink-tooltip[data-popper-placement^='top'] > .auto-hyperlink-tooltip-arrow {
          bottom: -4px;
      }
      .auto-hyperlink-tooltip[data-popper-placement^='bottom'] > .auto-hyperlink-tooltip-arrow {
          top: -4px;
      }
      .auto-hyperlink-tooltip.visible {
          opacity: 1;
          pointer-events: auto;
      }
      .auto-hyperlink-tooltip a {
          color: #8ab4f8;
          text-decoration: underline;
      }
    `);
  }

  /**
   * 调用后端 LLM API 提取关键词和定义。
   * @param {string} text 需要处理的文本。
   * @returns {Promise<Object>} 包含关键词及其定义的对象。
   */
  async getKeywordsAndDefinitionsFromLLM(text) {
    if (this.cache.has(text)) {
      return this.cache.get(text);
    }

    try {
      const response = await fetch(this.llmApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.cache.set(text, data);
      return data;
    } catch (error) {
      console.error(`调用 LLM API 失败:`, error);
      return {};
    }
  }

  /**
   * 将文本节点加入处理队列，并设置防抖。
   * @param {Text} node 要处理的文本节点。
   * @param {HTMLElement} parentElement 文本节点的父元素。
   */
  _queueTextForProcessing(node, parentElement) {
    // 跳过已经处理的
    if (this.processedElements.has(parentElement)) {
      return;
    }

    const textContent = node.nodeValue.trim();
    // 喜欢长的
    if (textContent.length < 5) {
        return;
    }

    // 使用 WeakMap 存储节点和其父元素，以便在处理后能够精确替换
    this.pendingTextNodes.set(node, parentElement);

    if (this.processingTimeout) {
        clearTimeout(this.processingTimeout);
    }
    this.processingTimeout = setTimeout(() => {
        this._processQueuedTextNodes();
    }, this.debounceDelay);
  }

  /**
   * 处理队列中的所有文本节点，批量发送到 LLM。
   */
  async _processQueuedTextNodes() {
    if (this.pendingTextNodes.size === 0) {
      return;
    }

    // 合并所有待处理文本
    let combinedText = '';
    const nodesToProcess = Array.from(this.pendingTextNodes.keys());
    nodesToProcess.forEach(node => {
      combinedText += node.nodeValue + '\n'; // 用换行符分隔不同文本节点的内容
    });

    this.pendingTextNodes.clear(); // 清空队列，准备下一批

    const keywordsMap = await this.getKeywordsAndDefinitionsFromLLM(combinedText);

    // 应用链接到原始节点
    nodesToProcess.forEach(node => {
      const parentElement = node.parentNode;
      if (parentElement && !this.processedElements.has(parentElement)) {
        this._applyLinksToNode(node, keywordsMap);
        this.processedElements.add(parentElement); // 标记父元素已处理
      }
    });
  }

  /**
   * 根据 LLM 返回的关键词字典，将超链接应用到指定的文本节点。
   * @param {Text} textNode 原始文本节点。
   * @param {Object} keywordsMap 从 LLM 获取的关键词及其定义。
   */
  _applyLinksToNode(textNode, keywordsMap) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.parentNode) {
      return;
    }

    const originalText = textNode.nodeValue;
    if (!originalText || originalText.trim().length === 0) {
      return;
    }

    let fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let hasMatch = false;

    // 根据 LLM 返回的关键词动态构建正则表达式
    const keywordKeys = Object.keys(keywordsMap);
    if (keywordKeys.length === 0) {
      fragment.appendChild(document.createTextNode(originalText));
      textNode.parentNode.replaceChild(fragment, textNode);
      return;
    }

    // 按关键词长度降序排序，避免短词匹配覆盖长词
    keywordKeys.sort((a, b) => b.length - a.length);
    const dynamicRegex = new RegExp(`\\b(${keywordKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi'); // 大小写不敏感，全局匹配

    dynamicRegex.lastIndex = 0; // 重置 regex 状态

    let match;
    while ((match = dynamicRegex.exec(originalText)) !== null) {
      const keyword = match[0];
      const index = match.index;
      const definition = keywordsMap[keyword.toLowerCase()] || keywordsMap[keyword]; // 兼容大小写

      if (!definition) continue; // 没有定义则跳过

      // 添加匹配前的文本
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(originalText.substring(lastIndex, index)));
      }

      // 创建超链接元素
      const a = document.createElement('a');
      a.href = 'javascript:void(0)'; // 防止实际跳转
      a.className = 'auto-hyperlink-link';
      a.textContent = keyword;
      a.dataset.term = keyword; // 存储关键词用于悬停提示

      // 悬停事件监听
      a.addEventListener('mouseenter', async (e) => {
        const termToLookup = e.target.dataset.term;
        const def = keywordsMap[termToLookup.toLowerCase()] || keywordsMap[termToLookup]; // 从已获取的字典中查找
        if (def) {
          showTooltip(e.target, `<strong>${termToLookup}</strong>: ${def.description || '无解释'} ${def.link ? `<br><a href="${def.link}" target="_blank" rel="noopener noreferrer">更多信息</a>` : ''}`);
        }
      });
      a.addEventListener('mouseleave', hideTooltip);
      a.addEventListener('click', (e) => e.preventDefault()); // 阻止默认点击行为

      fragment.appendChild(a);
      lastIndex = index + keyword.length;
      hasMatch = true;
    }

    // 添加匹配后的剩余文本
    if (lastIndex < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
    }

    // 如果有匹配发生，则替换原始文本节点
    if (hasMatch) {
      // 确保替换的节点还是原始的父节点的一部分
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }
  }


  /**
   * 遍历并处理初始 DOM 内容。
   * @param {HTMLElement} element 要遍历的根元素。
   */
  _initialScan(element) {
    if (element.nodeType === Node.TEXT_NODE) {
      this._queueTextForProcessing(element, element.parentNode);
    } else if (element.nodeType === Node.ELEMENT_NODE && !this.processedElements.has(element)) {
      // 避免处理脚本、样式或已处理的元素
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.classList.contains('auto-hyperlink-tooltip')) {
        return;
      }
      // 收集元素内的文本内容，发送给 LLM
      // 这是一个粗略的文本收集，更精确的应避免收集输入框等交互元素
      const textContent = element.textContent.trim();
      if (textContent.length > 5 && !this.processedElements.has(element)) { // 避免重复处理整个元素
        this._queueTextForProcessing(document.createTextNode(textContent), element);
      }
      // 递归处理子节点
      for (let i = 0; i < element.childNodes.length; i++) {
        this._initialScan(element.childNodes[i]);
      }
    }
  }


  /**
   * 启动 MutationObserver 监听 DOM 变化并处理文本。
   * @param {HTMLElement} rootElement 观察的根 DOM 元素。
   */
  observe(rootElement = document.body) {
    if (this.initialized) {
      console.warn("AutoHyperlink 已经初始化。如果要重新观察，请先调用 'destroy()'。");
      return;
    }

    // 初始扫描现有内容
    this._initialScan(rootElement);
    // 确保队列中的初始文本被处理
    this._processQueuedTextNodes();


    // 设置 MutationObserver 监听未来变化
    this.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            // 确保只处理新添加的未处理的文本节点或元素
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
              if (!this.processedElements.has(node.parentNode)) { // 检查父元素是否已处理
                this._queueTextForProcessing(node, node.parentNode);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE && !this.processedElements.has(node)) {
              // 避免处理脚本、样式或我们自己创建的 tooltip
              if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.classList.contains('auto-hyperlink-tooltip')) {
                return;
              }
              // 递归处理新添加的元素及其子节点
              // 收集元素内文本用于 LLM 处理
              const textContent = node.textContent.trim();
              if (textContent.length > 5 && !this.processedElements.has(node)) {
                this._queueTextForProcessing(document.createTextNode(textContent), node);
              }
            }
          });
        }
        // characterData 变化（文本内容直接改变）
        else if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          const parentElement = mutation.target.parentNode;
          // 如果父元素没有被标记为已处理，且不是我们自己创建的链接，则重新处理
          if (parentElement && !this.processedElements.has(parentElement) && !parentElement.classList.contains('auto-hyperlink-link')) {
            this._queueTextForProcessing(mutation.target, parentElement);
          }
        }
      });
      // 每次 mutation 循环结束后，确保队列中的文本被处理
      if (this.pendingTextNodes.size > 0) {
        if (this.processingTimeout) clearTimeout(this.processingTimeout);
        this.processingTimeout = setTimeout(() => {
          this._processQueuedTextNodes();
        }, this.debounceDelay);
      }
    });

    // 观察器配置：
    // childList: 观察子节点（如添加/删除元素）
    // subtree: 观察所有后代节点
    // characterData: 观察文本节点内容的改变
    this.observer.observe(rootElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    this.initialized = true;
    console.log("AutoHyperlink 观察已启动，文本将发送给 LLM 进行关键词提取。");
  }

  /**
   * 停止观察 DOM 变化并清理资源。
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    this.cache.clear();
    this.processedElements = new WeakSet(); // 重置
    this.pendingTextNodes.clear(); // 重置
    this.initialized = false;
    // 移除注入的 CSS (可选)
    const styleElement = document.head.querySelector('#auto-hyperlink-styles');
    if (styleElement) {
      styleElement.remove();
    }
    console.log("AutoHyperlink 观察已停止并清理。");
  }
}

export default AutoHyperlink;