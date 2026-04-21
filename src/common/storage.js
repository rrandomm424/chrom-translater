const STORAGE_KEYS = {
  SETTINGS: 'translator_settings',
  TRANSLATION_HISTORY: 'translation_history',
  CUSTOM_STYLES: 'custom_styles'
};

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

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS }, (result) => {
      const settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
      if (settings.style) {
        settings.style = { ...DEFAULT_SETTINGS.style, ...settings.style };
      }
      resolve(settings);
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve);
  });
}

async function updateSettings(updates) {
  const currentSettings = await getSettings();
  const newSettings = { ...currentSettings, ...updates };
  await saveSettings(newSettings);
  return newSettings;
}

async function resetSettings() {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

async function addToHistory(original, translated, from, to) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.TRANSLATION_HISTORY]: [] }, (result) => {
      const history = result[STORAGE_KEYS.TRANSLATION_HISTORY];
      history.unshift({
        original,
        translated,
        from,
        to,
        timestamp: Date.now()
      });
      
      if (history.length > 100) {
        history.pop();
      }
      
      chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATION_HISTORY]: history }, resolve);
    });
  });
}

async function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.TRANSLATION_HISTORY]: [] }, (result) => {
      resolve(result[STORAGE_KEYS.TRANSLATION_HISTORY]);
    });
  });
}

async function clearHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATION_HISTORY]: [] }, resolve);
  });
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

function generateStyleString(style) {
  let cssText = 'display: block; margin: 2px 0; padding: 2px 4px; border-radius: 2px; font-size: inherit; line-height: inherit;';
  
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
