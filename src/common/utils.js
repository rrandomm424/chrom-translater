const DEFAULT_SETTINGS = {
  enabled: true,
  autoDetect: true,
  targetLanguage: 'zh',
  style: {
    bold: false,
    underline: false,
    backgroundColor: '#ffff00',
    textColor: '#000000',
    opacity: 1
  }
};

function getDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result);
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
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

function applyStyleToElement(element, style) {
  if (style.bold) {
    element.style.fontWeight = 'bold';
  }
  if (style.underline) {
    element.style.textDecoration = 'underline';
  }
  if (style.backgroundColor) {
    element.style.backgroundColor = style.backgroundColor;
  }
  if (style.textColor) {
    element.style.color = style.textColor;
  }
  if (style.opacity !== undefined) {
    element.style.opacity = style.opacity;
  }
  element.style.display = 'block';
  element.style.margin = '2px 0';
  element.style.padding = '2px 4px';
  element.style.borderRadius = '2px';
}

function generateStyleString(style) {
  let cssText = 'display: block; margin: 2px 0; padding: 2px 4px; border-radius: 2px;';
  
  if (style.bold) {
    cssText += ' font-weight: bold;';
  }
  if (style.underline) {
    cssText += ' text-decoration: underline;';
  }
  if (style.backgroundColor) {
    cssText += ` background-color: ${style.backgroundColor};`;
  }
  if (style.textColor) {
    cssText += ` color: ${style.textColor};`;
  }
  if (style.opacity !== undefined) {
    cssText += ` opacity: ${style.opacity};`;
  }
  
  return cssText;
}

function isValidText(text) {
  if (!text || typeof text !== 'string') return false;
  
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  
  const hasMeaningfulChars = /[\u4e00-\u9fa5a-zA-Z]/.test(trimmed);
  return hasMeaningfulChars;
}

function isTextNode(node) {
  return node.nodeType === Node.TEXT_NODE;
}

function isElementNode(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}

function getTextNodes(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (isValidText(node.textContent)) {
      textNodes.push(node);
    }
  }
  
  return textNodes;
}
