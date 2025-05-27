import { createPopper } from '@popperjs/core';

// 相当于在原本 .css 中加一段
function injectCSS(css) {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

let currentTooltip = null;
let currentPopper = null;

// 显示提示框
function showTooltip(element, content) {
  if (currentTooltip) {
    hideTooltip();
  }

  // 创建一个提示框插入到原本 document.body 中
  currentTooltip = document.createElement('div');
  currentTooltip.className = 'auto-hyperlink-tooltip';
  currentTooltip.innerHTML = content;
  document.body.appendChild(currentTooltip);

  // 即提示框在目标上方 8px 处
  currentPopper = createPopper(element, currentTooltip, {
    placement: 'top',
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [0, 8],
        },
      }],
  });
}

// 隐藏提示框
function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
  if (currentPopper) {
    currentPopper.destroy();
    currentPopper = null;
  }
}

class AutoHyperlink {
  constructor(options = {}) {
    this.definitionApiUrl = options.definitionApiUrl || 'http://localhost:506'; // 本地获取定义的地址
    this.keywords = options.keywords || [];                                     // 默认关键词列表
    this.keywordsRegex = new RegExp(`\\b(${this.keywords.join('|')})\\b`, 'gi');// 正则表达式匹配关键词
    this.definitionsCache = {};
    this.initialized = false;
  }

  // 获取关键词 term 的定义
  async getDefinition(term) {
    if (this.definitionsCache[term]) {
      return this.definitionsCache[term];
    }

    // 从 API 获取定义并存到缓存
    try {
      const response = await fetch(`${this.definitionApiUrl}?term=${encodeURIComponent(term)}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.definitionsCache[term] = data;
      return data;
    } catch (error) {
      console.error('Error fetching definition:', error);
      return null;
    }
  }

  processTestNode(node) {
    // 首先确保节点是没被处理过的文本节点
    if (!node || node.nodeType !== Node.TEXT_NODE || node.parent.closest('.auto-hyperlink-processed')) {
      return;
    }

    // 检查文本内容是否包含关键词
    const parent = node.parentNode;
    const originalText = node.nodeValue;
    let lastIndex = 0;
    let fragment = document.createDocumentFragment();

    this.keywordRegex.lastIndex = 0; // 确保从头开始匹配
    let match;
    while ((match = this.keywordRegex.exec(originalText)) !== null) {
      const keyword = match[0];
      const index = match.index;

      // Add text before the match
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(originalText.substring(lastIndex, index)));
      }

      // Create the hyperlink element
      const a = document.createElement('a');
      a.href = 'javascript:void(0)'; // Prevent actual navigation
      a.className = 'auto-hyperlink-link';
      a.textContent = keyword;
      a.dataset.term = keyword; // Store the term for lookup

      // 加入鼠标放置事件监听器
      a.addEventListener('mouseenter', async (e) => {
        const term = e.target.dataset.term;
        const def = await this.getDefinition(term);
        if (def) {
          showTooltip(e.target, `<strong>${term}</strong>: ${def.description} ${def.link ? `<br><a href="${def.link}" target="_blank">更多信息</a>` : ''}`);
        }
      });
      a.addEventListener('mouseleave', hideTooltip);
      a.addEventListener('click', (e) => e.preventDefault()); // Prevent default click action

      // 将链接添加到文档片段中
      fragment.appendChild(a);
      lastIndex = index + keyword.length;
    }

    // 如果有剩余文本，添加到文档片段中
    if (lastIndex < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
    }

    if (fragment.childNodes.length > 1 || (fragment.childNodes.length === 1 && fragment.firstChild !== node)) {
      parent.replaceChild(fragment, node);
      parent.classList.add('auto-hyperlink-processed'); // 标记已被处理
    }
  }

  // 关键词高亮并通过 DOM 处理新节点
  observe(rootElement = document.body) {
    if (this.initialized) {
      console.warn("AutoHyperlink already initialized. Call 'destroy()' first if re-observing.");
      return;
    }

    // 先把已存在的元素加上关键词高亮
    rootElement.querySelectorAll('*').forEach(element => {
      element.childNodes.forEach(node => this.processTextNode(node));
    });

    // MutationObserver 监听 DOM 变化，处理文本节点
    this.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              this.processTextNode(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              node.querySelectorAll('*').forEach(element => {
                element.childNodes.forEach(childNode => this.processTextNode(childNode));
              });
              // Also process the element itself if it contains text directly
              if (node.textContent && node.children.length === 0) {
                this.processTextNode(node.firstChild);
              }
            }
          });
        } else if (mutation.type === 'characterData') {
          // Handle direct text content changes in existing nodes
          this.processTextNode(mutation.target);
        }
      });
    });

    // 设置监听的对象启动监听
    this.observer.observe(rootElement, {
      childList: true, // Observe direct children additions/removals
      subtree: true,   // Observe all descendants
      characterData: true // Observe changes to text content of nodes
    });

    this.initialized = true;
    console.log("AutoHyperlink observation started.");
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.initialized = false;
    // You might want to revert processed elements here if needed
    console.log("AutoHyperlink observation stopped.");
  }
}

injectCSS(`
    .auto-hyperlink-link {
        color: #1a73e8; /* Google Blue, or similar */
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
        z-index: 10000; /* Ensure it's on top */
        max-width: 250px;
        word-wrap: break-word;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none; /* Allows clicks through the tooltip area if it's not interactive */
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
        color: #8ab4f8; /* Lighter blue for links */
        text-decoration: underline;
    }
`);

export default AutoHyperlink;