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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ translator_settings: DEFAULT_SETTINGS }, () => {
      console.log('默认设置已初始化');
    });
    
    chrome.contextMenus.create({
      id: 'translate-text',
      title: '翻译选中的文本',
      contexts: ['selection']
    });
    
    chrome.contextMenus.create({
      id: 'translate-page',
      title: '翻译当前页面',
      contexts: ['page']
    });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-text' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translate-selection',
      text: info.selectionText
    });
  } else if (info.menuItemId === 'translate-page') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translate-page'
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-settings') {
    chrome.storage.sync.get({ translator_settings: DEFAULT_SETTINGS }, (result) => {
      sendResponse(result.translator_settings);
    });
    return true;
  }
  
  if (request.action === 'save-settings') {
    chrome.storage.sync.set({ translator_settings: request.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'translate') {
    handleTranslation(request.text, request.from, request.to)
      .then((translation) => {
        sendResponse({ success: true, translation });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'toggle-enabled') {
    chrome.storage.sync.get({ translator_settings: DEFAULT_SETTINGS }, (result) => {
      const settings = result.translator_settings;
      settings.enabled = !settings.enabled;
      chrome.storage.sync.set({ translator_settings: settings }, () => {
        sendResponse({ enabled: settings.enabled });
        updateBadge(settings.enabled);
      });
    });
    return true;
  }
});

async function handleTranslation(text, from, to) {
  const detectedLang = detectLanguage(text);
  
  let actualFrom = from;
  let actualTo = to;
  
  if (from === 'auto') {
    actualFrom = detectedLang;
  }
  
  if (to === 'auto') {
    actualTo = actualFrom === 'zh' ? 'en' : 'zh';
  }
  
  if (actualFrom === actualTo) {
    return text;
  }
  
  const cachedTranslation = await getFromCache(text, actualFrom, actualTo);
  if (cachedTranslation) {
    return cachedTranslation;
  }
  
  let translation = null;
  
  try {
    console.log('尝试使用 Google 翻译...');
    translation = await translateWithGoogle(text, actualFrom, actualTo);
    console.log('Google 翻译成功');
  } catch (googleError) {
    console.warn('Google 翻译失败，尝试 MyMemory:', googleError.message);
    try {
      translation = await translateWithMyMemory(text, actualFrom, actualTo);
      console.log('MyMemory 翻译成功');
    } catch (mymemoryError) {
      console.error('所有翻译服务都失败了:', mymemoryError.message);
      throw new Error(`翻译失败: ${mymemoryError.message}`);
    }
  }
  
  if (translation) {
    await saveToCache(text, actualFrom, actualTo, translation);
  }
  
  return translation;
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

async function translateWithGoogle(text, from, to) {
  const googleLang = {
    'zh': 'zh-CN',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'ja': 'ja',
    'fr': 'fr',
    'de': 'de',
    'es': 'es',
    'ru': 'ru'
  };
  
  const sourceLang = googleLang[from] || from;
  const targetLang = googleLang[to] || to;
  
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data[0] && Array.isArray(data[0])) {
      const translatedText = data[0]
        .map((item) => item[0])
        .filter((text) => text)
        .join('');
      
      if (translatedText && translatedText.trim()) {
        return translatedText.trim();
      }
    }
    
    throw new Error('Google 翻译返回无效数据');
  } catch (error) {
    console.error('Google 翻译失败:', error);
    throw error;
  }
}

async function translateWithMyMemory(text, from, to) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || '翻译失败');
  } catch (error) {
    console.error('MyMemory 翻译失败:', error);
    throw error;
  }
}

async function getFromCache(text, from, to) {
  const cacheKey = `${from}|${to}|${text}`;
  return new Promise((resolve) => {
    chrome.storage.local.get([cacheKey], (result) => {
      resolve(result[cacheKey]);
    });
  });
}

async function saveToCache(text, from, to, translation) {
  const cacheKey = `${from}|${to}|${text}`;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [cacheKey]: translation }, resolve);
  });
}

function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#999999' });
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.translator_settings) {
    const newSettings = changes.translator_settings.newValue;
    updateBadge(newSettings ? newSettings.enabled : true);
  }
});
