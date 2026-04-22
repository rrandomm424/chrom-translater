(function() {
  'use strict';
  
  const DEFAULT_SETTINGS = {
    enabled: true,
    autoDetect: true,
    defaultFrom: 'auto',
    defaultTo: 'zh',
    style: {
      bold: false,
      underline: false,
      backgroundColor: '#fff3cd',
      textColor: '#856404',
      opacity: 1
    },
    showOriginal: true,
    translationPosition: 'below',
    excludeDomains: []
  };
  
  let currentSettings = DEFAULT_SETTINGS;
  const TRANSLATION_CACHE = new Map();
  const TRANSLATED_ELEMENTS = new WeakMap();
  const OBSERVER = new MutationObserver(handleMutations);
  const DEBOUNCE_TIMERS = new Map();
  const PROCESSING_TEXT_NODES = new WeakSet();
  const PROCESSED_PARENTS = new WeakSet();
  
  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'textarea', 'input',
    'select', 'option', 'head', 'meta', 'link', 'title',
    'iframe', 'canvas', 'svg', 'video', 'audio',
    'pre', 'code', 'samp', 'kbd', 'var'
  ]);
  
  const SKIP_CLASSES = new Set([
    'translator-extension-translation',
    'no-translate',
    'notranslate'
  ]);
  
  init();
  
  async function init() {
    await loadSettings();
    setupMessageListeners();
    setupMutationObserver();
    
    if (currentSettings.enabled) {
      observePage();
      setTimeout(translatePage, 1000);
    }
  }
  
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-settings' }, (response) => {
        if (response && !chrome.runtime.lastError) {
          currentSettings = { ...DEFAULT_SETTINGS, ...response };
          if (currentSettings.style) {
            currentSettings.style = { ...DEFAULT_SETTINGS.style, ...currentSettings.style };
          }
        }
        resolve();
      });
    });
  }
  
  function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle-translation') {
        toggleTranslation();
        sendResponse({ success: true });
      } else if (request.action === 'update-settings') {
        currentSettings = { ...currentSettings, ...request.settings };
        if (currentSettings.enabled) {
          refreshTranslations();
        } else {
          removeAllTranslations();
        }
        sendResponse({ success: true });
      } else if (request.action === 'translate-selection') {
        translateSelectedText(request.text);
        sendResponse({ success: true });
      } else if (request.action === 'translate-page') {
        translatePage();
        sendResponse({ success: true });
      } else if (request.action === 'clear-translations') {
        removeAllTranslations();
        sendResponse({ success: true });
      }
      return true;
    });
  }
  
  function setupMutationObserver() {
    OBSERVER.disconnect();
  }
  
  function observePage() {
    OBSERVER.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  function handleMutations(mutations) {
    if (!currentSettings.enabled) return;
    
    const timerKey = 'mutation-debounce';
    if (DEBOUNCE_TIMERS.has(timerKey)) {
      clearTimeout(DEBOUNCE_TIMERS.get(timerKey));
    }
    
    DEBOUNCE_TIMERS.set(timerKey, setTimeout(() => {
      const changedElements = new Set();
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              collectTranslatableElements(node, changedElements);
            }
          }
        } else if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent && shouldTranslateElement(parent)) {
            changedElements.add(parent);
          }
        }
      }
      
      for (const element of changedElements) {
        debounceTranslateElement(element);
      }
    }, 500));
  }
  
  function collectTranslatableElements(root, resultSet) {
    if (!root) return;
    
    if (shouldTranslateElement(root)) {
      resultSet.add(root);
    }
    
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (shouldTranslateElement(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      resultSet.add(node);
    }
  }
  
  function debounceTranslateElement(element) {
    const timerKey = `element-${element.hashCode ? element.hashCode() : Math.random()}`;
    if (DEBOUNCE_TIMERS.has(timerKey)) {
      clearTimeout(DEBOUNCE_TIMERS.get(timerKey));
    }
    
    DEBOUNCE_TIMERS.set(timerKey, setTimeout(() => {
      translateElement(element);
    }, 300));
  }
  
  function toggleTranslation() {
    currentSettings.enabled = !currentSettings.enabled;
    
    if (currentSettings.enabled) {
      observePage();
      translatePage();
    } else {
      OBSERVER.disconnect();
      removeAllTranslations();
    }
  }
  
  function removeAllTranslations() {
    const translations = document.querySelectorAll('.translator-extension-translation');
    translations.forEach(el => el.remove());
    TRANSLATED_ELEMENTS.clear();
    PROCESSED_PARENTS.clear();
  }
  
  function refreshTranslations() {
    removeAllTranslations();
    translatePage();
  }
  
  async function translatePage() {
    if (!currentSettings.enabled) return;
    
    const elements = collectPageElements();
    const batch = [];
    
    for (const element of elements) {
      const textNodes = getValidTextNodes(element);
      for (const textNode of textNodes) {
        const text = textNode.textContent.trim();
        if (isValidTranslationText(text)) {
          batch.push({ element, textNode, text });
        }
      }
    }
    
    for (const item of batch) {
      await translateTextNode(item.element, item.textNode, item.text);
    }
  }
  
  function collectPageElements() {
    const elements = [];
    const selector = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div:not([class*="translator"])';
    
    try {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        if (shouldTranslateElement(el)) {
          elements.push(el);
        }
      }
    } catch (e) {
      console.warn('收集页面元素失败:', e);
    }
    
    return elements;
  }
  
  function shouldTranslateElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName?.toLowerCase();
    if (SKIP_TAGS.has(tagName)) return false;
    
    for (const className of SKIP_CLASSES) {
      if (element.classList?.contains(className)) return false;
    }
    
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.display === 'none' || 
        computedStyle.visibility === 'hidden' ||
        parseFloat(computedStyle.opacity) === 0) {
      return false;
    }
    
    const text = element.textContent?.trim() || '';
    if (!text || text.length < 3) return false;
    
    return true;
  }
  
  function getValidTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (isValidTranslationText(text)) {
        textNodes.push(node);
      }
    }
    
    return textNodes;
  }
  
  function isValidTranslationText(text) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    if (trimmed.length < 3) return false;
    
    if (/^[\d\s\-_.,!?;:'"()\[\]{}]+$/.test(trimmed)) return false;
    
    const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
    const hasEnglish = /[a-zA-Z]/.test(trimmed);
    
    if (!hasChinese && !hasEnglish) return false;
    
    return true;
  }
  
  function detectLanguage(text) {
    const chinesePattern = /[\u4e00-\u9fa5]/;
    const englishPattern = /[a-zA-Z]/;
    
    const hasChinese = chinesePattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasChinese && !hasEnglish) {
      return 'zh';
    } else if (hasEnglish && !hasChinese) {
      return 'en';
    } else {
      const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
      
      return chineseCount > englishCount ? 'zh' : 'en';
    }
  }
  
  async function translateElement(element) {
    if (!currentSettings.enabled) return;
    if (!shouldTranslateElement(element)) return;
    
    const textNodes = getValidTextNodes(element);
    for (const textNode of textNodes) {
      const text = textNode.textContent.trim();
      if (isValidTranslationText(text)) {
        await translateTextNode(element, textNode, text);
      }
    }
  }
  
  async function translateTextNode(element, textNode, text) {
    if (PROCESSING_TEXT_NODES.has(textNode)) return;
    PROCESSING_TEXT_NODES.add(textNode);
    
    try {
      const detectedLang = detectLanguage(text);
      let targetLang = currentSettings.defaultTo;
      
      if (targetLang === 'auto') {
        targetLang = detectedLang === 'zh' ? 'en' : 'zh';
      }
      
      if (detectedLang === targetLang) {
        return;
      }
      
      const existingTranslation = TRANSLATED_ELEMENTS.get(textNode);
      if (existingTranslation) {
        return;
      }
      
      const cacheKey = `${detectedLang}|${targetLang}|${text}`;
      let translatedText = TRANSLATION_CACHE.get(cacheKey);
      
      if (!translatedText) {
        translatedText = await sendTranslationRequest(text, detectedLang, targetLang);
        if (translatedText) {
          TRANSLATION_CACHE.set(cacheKey, translatedText);
        }
      }
      
      if (translatedText && translatedText !== text) {
        insertTranslation(textNode, translatedText);
      }
    } finally {
      PROCESSING_TEXT_NODES.delete(textNode);
    }
  }
  
  async function sendTranslationRequest(text, from, to) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'translate', text, from, to },
        (response) => {
          if (response && response.success && response.translation) {
            resolve(response.translation);
          } else {
            resolve(null);
          }
        }
      );
    });
  }
  
  function insertTranslation(textNode, translatedText) {
    try {
      const parent = textNode.parentElement;
      if (!parent) return;
      
      const styleString = generateStyleString(currentSettings.style);
      const translationSpan = document.createElement('span');
      translationSpan.className = 'translator-extension-translation';
      translationSpan.style.cssText = styleString;
      translationSpan.textContent = translatedText;
      translationSpan.dataset.original = textNode.textContent;
      
      const range = document.createRange();
      range.selectNodeContents(textNode);
      
      const wrapper = document.createElement('span');
      wrapper.className = 'translator-extension-wrapper';
      wrapper.style.display = 'inline';
      
      const textClone = textNode.cloneNode(true);
      wrapper.appendChild(textClone);
      
      if (currentSettings.translationPosition === 'below') {
        wrapper.appendChild(document.createElement('br'));
      }
      wrapper.appendChild(translationSpan);
      
      range.deleteContents();
      range.insertNode(wrapper);
      
      TRANSLATED_ELEMENTS.set(textNode, translationSpan);
    } catch (e) {
      console.warn('插入翻译失败:', e);
    }
  }
  
  async function translateSelectedText(text) {
    if (!text || !currentSettings.enabled) return;
    
    const detectedLang = detectLanguage(text);
    let targetLang = currentSettings.defaultTo;
    
    if (targetLang === 'auto') {
      targetLang = detectedLang === 'zh' ? 'en' : 'zh';
    }
    
    if (detectedLang === targetLang) {
      return;
    }
    
    const translatedText = await sendTranslationRequest(text, detectedLang, targetLang);
    if (translatedText) {
      showTranslationPopup(translatedText);
    }
  }
  
  function showTranslationPopup(text) {
    const existingPopup = document.getElementById('translator-extension-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.id = 'translator-extension-popup';
    popup.className = 'translator-extension-popup';
    
    const styleString = generateStyleString(currentSettings.style);
    popup.innerHTML = `
      <div class="translator-extension-popup-header">
        <span>翻译结果</span>
        <button class="translator-extension-close-btn">×</button>
      </div>
      <div class="translator-extension-popup-content" style="${styleString}">${text}</div>
    `;
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      popup.style.position = 'fixed';
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.bottom + 10}px`;
      popup.style.zIndex = '999999';
      popup.style.backgroundColor = '#ffffff';
      popup.style.border = '1px solid #ddd';
      popup.style.borderRadius = '8px';
      popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      popup.style.padding = '12px';
      popup.style.maxWidth = '400px';
      popup.style.minWidth = '200px';
      popup.style.fontSize = '14px';
      popup.style.lineHeight = '1.6';
      
      const header = popup.querySelector('.translator-extension-popup-header');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';
      header.style.paddingBottom = '8px';
      header.style.borderBottom = '1px solid #eee';
      header.style.fontWeight = 'bold';
      header.style.color = '#333';
      
      const closeBtn = popup.querySelector('.translator-extension-close-btn');
      closeBtn.style.background = 'none';
      closeBtn.style.border = 'none';
      closeBtn.style.fontSize = '18px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.color = '#999';
      closeBtn.style.padding = '0';
      closeBtn.style.lineHeight = '1';
      
      closeBtn.onclick = () => popup.remove();
      
      document.body.appendChild(popup);
      
      setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
          if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closePopup);
          }
        });
      }, 100);
    }
  }
  
  function generateStyleString(style) {
    let cssText = '';
    
    if (style.bold) {
      cssText += 'font-weight: bold; ';
    }
    if (style.underline) {
      cssText += 'text-decoration: underline; ';
    }
    if (style.backgroundColor) {
      cssText += `background-color: ${style.backgroundColor}; `;
    }
    if (style.textColor) {
      cssText += `color: ${style.textColor}; `;
    }
    if (style.opacity !== undefined) {
      cssText += `opacity: ${style.opacity}; `;
    }
    
    return cssText.trim();
  }
  
  if (!String.prototype.hashCode) {
    String.prototype.hashCode = function() {
      let hash = 0;
      if (this.length === 0) return hash;
      for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash;
    };
  }
})();
