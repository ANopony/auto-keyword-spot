// index.js (重新优化后的前端库文件)
const { createPopper } = require('@popperjs/core');

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

function showTooltip(element, content) {
  if (currentTooltip) {
    hideTooltip();
  }

  currentTooltip = document.createElement('div');
  currentTooltip.className = 'auto-hyperlink-tooltip';
  currentTooltip.innerHTML = content;
  document.body.appendChild(currentTooltip);

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
    currentTooltip.classList.add('visible');
  });
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.classList.remove('visible');
    currentTooltip.addEventListener('transitionend', () => {
      if (currentPopper) {
        currentPopper.destroy();
        currentPopper = null;
      }
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }
    }, { once: true });
  }
}

// 辅助函数：查找文本中的下一个分隔符（如句号、问号、换行）
function findNextSegmentEnd(text, startIndex) {
    const delimiters = ['.', '。', '?', '？', '!', '！', '\n'];
    let minIndex = -1;
    for (const delimiter of delimiters) {
        const index = text.indexOf(delimiter, startIndex);
        if (index !== -1 && (minIndex === -1 || index < minIndex)) {
            minIndex = index;
        }
    }
    // 返回包含分隔符的索引
    return minIndex !== -1 ? minIndex + 1 : -1;
}

class AutoHyperlink {
  constructor(options = {}) {
    console.info("[AutoHyperlink] Constructing...");
    this.llmApiUrl = options.llmApiUrl || 'http://localhost:943/api/extract_keywords';
    this.cache = new Map();                   // 缓存 LLM 响应，{文本块：值}
    this.processedTextLengths = new Map();    // 存储每个容器已处理的文本长度
    this.processingTimeouts = new Map();      // 存储每个容器的防抖定时器 ID
    this.observer = null;
    this.initialized = false;
    this.debounceDelay = options.debounceDelay || 700; // 防抖延迟
    this.targetContainers = new Set();        // 存储所有需要处理的容器元素
    this.isProcessingMutation = false;        // 标记是否正在处理由自身导致的 DOM 变动

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
          transition: opacity 0.2s ease-in-out;
          pointer-events: none;
          position: absolute;
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
      console.info("[AutoHyperlink] 从缓存获取:", text.substring(0, Math.min(text.length, 50)), "...");
      return this.cache.get(text);
    }

    try {
      console.info("[AutoHyperlink] 调用 LLM API，文本前50字:", text.substring(0, Math.min(text.length, 50)), "...");
      const response = await fetch(this.llmApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
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
   * 处理流式输出容器中的文本，按段落/句子分块发送。
   * 核心逻辑：增量提取、分段、LLM调用、应用链接。
   * @param {HTMLElement} containerElement 流式输出的容器元素。
   */
  async _processStreamingContainer(containerElement) {
    const currentFullText = containerElement.textContent || '';
    let lastProcessedLength = this.processedTextLengths.get(containerElement) || 0;
    
    // 提取自上次处理以来新增的文本部分
    const newTextSegmentRaw = currentFullText.substring(lastProcessedLength);

    // 如果没有新文本或新文本过短，不处理
    if (newTextSegmentRaw.trim().length < 5) {
        return;
    }
    
    let segmentStartIndex = 0;
    let segmentEndRelative = findNextSegmentEnd(newTextSegmentRaw, segmentStartIndex);
    let hasProcessedSegment = false; // 标记是否至少处理了一个完整分段

    // 循环提取并处理完整的句子/段落
    while (segmentEndRelative !== -1) {
        const textToProcess = newTextSegmentRaw.substring(segmentStartIndex, segmentEndRelative).trim();

        if (textToProcess.length > 0) {
            console.info("[AutoHyperlink] 识别到完整分段，准备调用LLM:", textToProcess.substring(0, Math.min(textToProcess.length, 50)), "...");
            const keywordsMap = await this.getKeywordsAndDefinitionsFromLLM(textToProcess);
            // 应用链接到整个容器，但只处理未链接的文本节点
            this._applyLinksToContainer(containerElement, keywordsMap);
            hasProcessedSegment = true;
        }

        segmentStartIndex = segmentEndRelative;
        segmentEndRelative = findNextSegmentEnd(newTextSegmentRaw, segmentStartIndex);
    }

    // 如果循环结束，但仍有未完成的文本（例如，一句话还没说完），可以根据需求决定是否处理
    const remainingTextAfterSegmentation = newTextSegmentRaw.substring(segmentStartIndex).trim();
    if (remainingTextAfterSegmentation.length > 0) { // 即使没有完整分隔符，只要有剩余文本就尝试处理
        console.info("[AutoHyperlink] 处理剩余文本，准备调用LLM:", remainingTextAfterSegmentation.substring(0, Math.min(remainingTextAfterSegmentation.length, 50)), "...");
        const keywordsMap = await this.getKeywordsAndDefinitionsFromLLM(remainingTextAfterSegmentation);
        this._applyLinksToContainer(containerElement, keywordsMap);
        hasProcessedSegment = true;
    }

    // 只有当至少处理了一个分段（或剩余文本）后，才更新 processedTextLengths
    // 这样确保 LLM 真正处理了这部分文本，避免下次重复处理
    if (hasProcessedSegment) {
        this.processedTextLengths.set(containerElement, currentFullText.length);
    }
    console.info("[AutoHyperlink] 容器处理完成。");
  }

  /**
   * 将链接应用到指定容器内的文本。
   * 它会遍历容器内的文本节点，并替换为带链接的 DOM 片段。
   * @param {HTMLElement} containerElement 要应用链接的容器元素。
   * @param {Object} keywordsMap 从 LLM 获取的关键词及其定义。
   */
  _applyLinksToContainer(containerElement, keywordsMap) {
    // 避免处理我们自己的 tooltip 元素
    if (containerElement.classList.contains('auto-hyperlink-tooltip')) {
        return;
    }

    // 在 DOM 替换时临时停止观察器，防止无限循环
    this.isProcessingMutation = true;
    if (this.observer) {
        this.observer.disconnect();
    }

    try {
        const walker = document.createTreeWalker(
            containerElement,
            NodeFilter.SHOW_TEXT,
            {
                // 过滤器：只处理满足条件的文本节点
                acceptNode: function(node) {
                    // 如果文本节点父元素是我们创建的链接，则跳过
                    if (node.parentNode && node.parentNode.classList.contains('auto-hyperlink-link')) {
                        return NodeFilter.FILTER_SKIP;
                    }
                    // 确保文本不为空白
                    if (node.nodeValue.trim().length > 0) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            },
            false
        );

        let node;
        const textNodesToProcess = [];
        while ((node = walker.nextNode())) {
            textNodesToProcess.push(node);
        }

        // 反向遍历以避免 DOM 改变影响遍历
        textNodesToProcess.reverse().forEach(textNode => {
            this._replaceTextNodeWithLinks(textNode, keywordsMap);
        });
    } finally {
        // 重新连接观察器
        if (this.observer && containerElement.parentNode) { // 确保容器还在DOM中
            this.observer.observe(this.targetContainers.values().next().value, { // 重新观察最初的目标
                childList: true,
                subtree: true,
                characterData: true
            });
        }
        this.isProcessingMutation = false;
    }
  }

  /**
   * 替换单个文本节点的内容，并应用链接。
   * @param {Text} textNode 原始文本节点。
   * @param {Object} keywordsMap 从 LLM 获取的关键词及其定义。
   */
  _replaceTextNodeWithLinks(textNode, keywordsMap) {
    const originalText = textNode.nodeValue;
    console.info("[replace] 原文本:", originalText);
    if (!originalText || originalText.trim().length === 0) {
      return;
    }
    
    // 如果该文本节点已经在一个链接中，或者其父元素已经被标记为已处理的区域，则跳过
    if (textNode.parentNode && textNode.parentNode.classList.contains('auto-hyperlink-link')) {
        return;
    }

    let fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let hasMatch = false;

    const keywordKeys = Object.keys(keywordsMap);
    console.info("[replace] 关键词:", keywordKeys);
    if (keywordKeys.length === 0) {
      return; // 没有关键词，不处理
    }

    // 按关键词长度降序排序，避免短词匹配覆盖长词
    keywordKeys.sort((a, b) => b.length - a.length);
    // 使用非捕获分组 (?:...) 来提高性能，并确保 \b 匹配单词边界
    // 区分中英文关键词
    const chineseKeywords = keywordKeys.filter(k => /[\u4e00-\u9fa5]/.test(k));
    const englishKeywords = keywordKeys.filter(k => /^[a-zA-Z0-9_]+$/.test(k));

    // 构造正则
    let patterns = [];
    if (chineseKeywords.length > 0) {
      patterns.push(
        chineseKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      );
    }
    if (englishKeywords.length > 0) {
      patterns.push(
        '\\b(?:' + englishKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b'
      );
    }
    const dynamicRegex = new RegExp(`(?:${patterns.join('|')})`, 'gi');
    console.info("[replace]", dynamicRegex.source);

    dynamicRegex.lastIndex = 0; // 重置 regex 状态

    let match;
    while ((match = dynamicRegex.exec(originalText)) !== null) {
      const keyword = match[0];
      const index = match.index;
      // 兼容大小写查找原始关键词
      const definition = keywordsMap[keyword.toLowerCase()] || keywordsMap[keyword]; 

      console.info("[replace] 匹配到关键词:", keyword, "位置:", index, "定义:", definition);

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

      // 点击事件监听
      console.log("[replace] 添加悬停事件监听器", keyword);
      a.addEventListener('click', async (e) => {
        e.preventDefault(); // 阻止默认点击行为
        const termToLookup = e.target.dataset.term;
        const def = keywordsMap[termToLookup.toLowerCase()] || keywordsMap[termToLookup];
        if (def) {
          showTooltip(e.target, `<strong>${termToLookup}</strong>: ${def.description || '无解释'}${def.link ? `<br><a href="${def.link}" target="_blank" rel="noopener noreferrer">更多信息</a>` : ''}`);
        }
      });
      // 点击其他地方关闭
      document.addEventListener('click', (event) => {
        if (!event.target.classList.contains('auto-hyperlink-link') && currentTooltip) {
          hideTooltip();
        }
      });

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
      // 确保替换的节点还在 DOM 中
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }
  }

  /**
   * 启动 MutationObserver 监听 DOM 变化并处理文本。
   * @param {HTMLElement | string} target 观察的根 DOM 元素或其 ID。
   * 在流式输出场景，建议指定流式输出的容器 ID。
   */
  observe(target) {
    if (this.initialized) {
      console.warn("AutoHyperlink 已经初始化。如果要重新观察，请先调用 'destroy()'。");
      return;
    }

    let rootElement;
    if (typeof target === 'string') {
      rootElement = document.getElementById(target);
      if (!rootElement) {
        console.error(`未找到 ID 为 "${target}" 的观察目标元素。`);
        return;
      }
    } else if (target instanceof HTMLElement) {
      rootElement = target;
    } else {
      console.error("观察目标必须是 HTMLElement 或其 ID 字符串。");
      return;
    }

    // 添加到目标容器列表
    this.targetContainers.add(rootElement);

    // 初始扫描（如果容器已经有内容）
    // 对于初始内容，立即触发一次处理
    this._processStreamingContainer(rootElement);

    // 设置 MutationObserver 监听未来变化
    this.observer = new MutationObserver(mutations => {
        // 如果是自身操作导致的变动，则跳过
        if (this.isProcessingMutation) {
            return;
        }

        mutations.forEach(mutation => {
            // 检查变动是否发生在任何一个目标容器内部
            let containerChanged = null;
            if (this.targetContainers.has(mutation.target)) { // 变动发生在目标容器自身
                containerChanged = mutation.target;
            } else if (mutation.target.parentNode && this.targetContainers.has(mutation.target.parentNode)) { // 变动发生在目标容器的直接子节点
                containerChanged = mutation.target.parentNode;
            } else { // 检查变动是否在目标容器的子树内
                for (const targetContainer of this.targetContainers) {
                    if (targetContainer.contains(mutation.target)) {
                        containerChanged = targetContainer;
                        break;
                    }
                }
            }

            if (containerChanged) {
                // 如果检测到目标容器内的文本或子节点有变化，设置防抖定时器
                if (this.processingTimeouts.has(containerChanged)) {
                    clearTimeout(this.processingTimeouts.get(containerChanged));
                }
                const timeoutId = setTimeout(() => {
                    this._processStreamingContainer(containerChanged);
                }, this.debounceDelay);
                this.processingTimeouts.set(containerChanged, timeoutId);
            }
        });
    });

    // 观察器配置：
    // childList: 观察子节点（如添加/删除元素）
    // subtree: 观察所有后代节点
    // characterData: 观察文本节点内容的改变
    this.observer.observe(rootElement, { // 观察整个根元素
      childList: true,
      subtree: true,
      characterData: true
    });

    this.initialized = true;
    console.log(`AutoHyperlink 观察已启动，目标：${rootElement.id || rootElement.tagName}。文本将发送给 LLM 进行关键词提取。`);
  }

  /**
   * 停止观察 DOM 变化并清理资源。
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    // 清除所有悬而未决的定时器
    this.processingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.processingTimeouts.clear();

    this.cache.clear();
    this.processedTextLengths.clear(); // 重置已处理长度
    this.targetContainers.clear(); // 清理目标容器
    this.initialized = false;
    // 移除注入的 CSS (可选)
    const styleElement = document.head.querySelector('#auto-hyperlink-styles');
    if (styleElement) {
      styleElement.remove();
    }
    console.log("AutoHyperlink 观察已停止并清理。");
  }
}

module.exports = AutoHyperlink;