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
  
  if (request.action === 'get-custom-translation') {
    getCustomTranslation(request.text, request.from, request.to)
      .then((customTranslation) => {
        sendResponse({ success: true, customTranslation });
      })
      .catch(() => {
        sendResponse({ success: false, customTranslation: null });
      });
    return true;
  }
  
  if (request.action === 'is-word-excluded') {
    isWordExcluded(request.word)
      .then((excluded) => {
        sendResponse({ success: true, excluded });
      })
      .catch(() => {
        sendResponse({ success: false, excluded: false });
      });
    return true;
  }
  
  if (request.action === 'is-word-in-vocabulary') {
    isWordInVocabulary(request.word)
      .then((inVocabulary) => {
        sendResponse({ success: true, inVocabulary });
      })
      .catch(() => {
        sendResponse({ success: false, inVocabulary: false });
      });
    return true;
  }
  
  if (request.action === 'add-to-vocabulary') {
    addToVocabulary(request.word, request.translation, request.from, request.to)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'remove-from-vocabulary') {
    removeFromVocabularyByWord(request.word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'add-exclude-word') {
    addExcludeWord(request.word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'add-custom-translation') {
    addCustomTranslation(request.original, request.customTranslation, request.from, request.to)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'get-vocabulary') {
    getVocabulary()
      .then((vocabulary) => {
        sendResponse({ success: true, vocabulary });
      })
      .catch(() => {
        sendResponse({ success: false, vocabulary: [] });
      });
    return true;
  }
  
  if (request.action === 'remove-vocabulary-item') {
    removeFromVocabulary(request.id)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'update-vocabulary-notes') {
    updateVocabularyNotes(request.id, request.notes)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'get-exclude-words') {
    getExcludeWords()
      .then((words) => {
        sendResponse({ success: true, words });
      })
      .catch(() => {
        sendResponse({ success: false, words: [] });
      });
    return true;
  }
  
  if (request.action === 'get-custom-translations') {
    getCustomTranslations()
      .then((customTranslations) => {
        sendResponse({ success: true, customTranslations });
      })
      .catch(() => {
        sendResponse({ success: false, customTranslations: {} });
      });
    return true;
  }
  
  if (request.action === 'remove-exclude-word') {
    removeExcludeWord(request.word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(() => {
        sendResponse({ success: false });
      });
    return true;
  }
  
  if (request.action === 'get-word-definition') {
    getWordDefinition(request.word, request.lang)
      .then((definition) => {
        sendResponse({ success: true, definition });
      })
      .catch(() => {
        sendResponse({ success: false, definition: null });
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

const VOCABULARY_KEY = 'translator_vocabulary';
const EXCLUDE_WORDS_KEY = 'translator_exclude_words';
const CUSTOM_TRANSLATIONS_KEY = 'translator_custom_translations';

async function getVocabulary() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [VOCABULARY_KEY]: [] }, (result) => {
      resolve(result[VOCABULARY_KEY]);
    });
  });
}

async function addToVocabulary(word, translation, from, to, notes = '') {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [VOCABULARY_KEY]: [] }, (result) => {
      const vocabulary = result[VOCABULARY_KEY];
      
      const existingIndex = vocabulary.findIndex(item => item.word.toLowerCase() === word.toLowerCase());
      
      if (existingIndex >= 0) {
        vocabulary[existingIndex] = {
          ...vocabulary[existingIndex],
          translation,
          from,
          to,
          notes,
          updatedAt: Date.now()
        };
      } else {
        vocabulary.unshift({
          id: 'vocab-' + Date.now(),
          word,
          translation,
          from,
          to,
          notes,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      
      if (vocabulary.length > 500) {
        vocabulary.pop();
      }
      
      chrome.storage.local.set({ [VOCABULARY_KEY]: vocabulary }, () => {
        resolve(vocabulary);
      });
    });
  });
}

async function removeFromVocabulary(id) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [VOCABULARY_KEY]: [] }, (result) => {
      const vocabulary = result[VOCABULARY_KEY].filter(item => item.id !== id);
      chrome.storage.local.set({ [VOCABULARY_KEY]: vocabulary }, () => {
        resolve(vocabulary);
      });
    });
  });
}

async function removeFromVocabularyByWord(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [VOCABULARY_KEY]: [] }, (result) => {
      const lowerWord = word.toLowerCase();
      const vocabulary = result[VOCABULARY_KEY].filter(item => item.word.toLowerCase() !== lowerWord);
      chrome.storage.local.set({ [VOCABULARY_KEY]: vocabulary }, () => {
        resolve(vocabulary);
      });
    });
  });
}

async function updateVocabularyNotes(id, notes) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [VOCABULARY_KEY]: [] }, (result) => {
      const vocabulary = result[VOCABULARY_KEY];
      const index = vocabulary.findIndex(item => item.id === id);
      
      if (index >= 0) {
        vocabulary[index].notes = notes;
        vocabulary[index].updatedAt = Date.now();
      }
      
      chrome.storage.local.set({ [VOCABULARY_KEY]: vocabulary }, () => {
        resolve(vocabulary);
      });
    });
  });
}

async function isWordInVocabulary(word) {
  const vocabulary = await getVocabulary();
  return vocabulary.some(item => item.word.toLowerCase() === word.toLowerCase());
}

async function getExcludeWords() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [EXCLUDE_WORDS_KEY]: [] }, (result) => {
      resolve(result[EXCLUDE_WORDS_KEY]);
    });
  });
}

async function addExcludeWord(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [EXCLUDE_WORDS_KEY]: [] }, (result) => {
      const excludeWords = result[EXCLUDE_WORDS_KEY];
      const lowerWord = word.toLowerCase();
      
      if (!excludeWords.includes(lowerWord)) {
        excludeWords.push(lowerWord);
      }
      
      chrome.storage.local.set({ [EXCLUDE_WORDS_KEY]: excludeWords }, () => {
        resolve(excludeWords);
      });
    });
  });
}

async function removeExcludeWord(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [EXCLUDE_WORDS_KEY]: [] }, (result) => {
      const lowerWord = word.toLowerCase();
      const excludeWords = result[EXCLUDE_WORDS_KEY].filter(w => w !== lowerWord);
      chrome.storage.local.set({ [EXCLUDE_WORDS_KEY]: excludeWords }, () => {
        resolve(excludeWords);
      });
    });
  });
}

async function isWordExcluded(word) {
  const excludeWords = await getExcludeWords();
  return excludeWords.includes(word.toLowerCase());
}

async function getCustomTranslations() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [CUSTOM_TRANSLATIONS_KEY]: {} }, (result) => {
      resolve(result[CUSTOM_TRANSLATIONS_KEY]);
    });
  });
}

async function addCustomTranslation(original, customTranslation, from, to) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [CUSTOM_TRANSLATIONS_KEY]: {} }, (result) => {
      const customTranslations = result[CUSTOM_TRANSLATIONS_KEY];
      const key = `${from}|${to}|${original.toLowerCase()}`;
      
      customTranslations[key] = {
        original,
        customTranslation,
        from,
        to,
        createdAt: Date.now()
      };
      
      chrome.storage.local.set({ [CUSTOM_TRANSLATIONS_KEY]: customTranslations }, () => {
        resolve(customTranslations);
      });
    });
  });
}

async function getCustomTranslation(original, from, to) {
  const customTranslations = await getCustomTranslations();
  const key = `${from}|${to}|${original.toLowerCase()}`;
  return customTranslations[key]?.customTranslation || null;
}

async function getWordDefinition(word, lang) {
  const lowerWord = word.toLowerCase().trim();
  
  if (lang === 'en' || detectLanguage(lowerWord) === 'en') {
    try {
      const definition = await getEnglishDefinition(lowerWord);
      if (definition) {
        return definition;
      }
    } catch (e) {
      console.warn('获取英文释义失败:', e);
    }
  }
  
  const chineseTranslation = await handleTranslation(lowerWord, lang, lang === 'zh' ? 'en' : 'zh');
  
  return {
    word: lowerWord,
    simpleTranslation: chineseTranslation,
    definitions: [],
    phonetic: null,
    examples: []
  };
}

async function getEnglishDefinition(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    
    const entry = data[0];
    const result = {
      word: entry.word || word,
      phonetic: entry.phonetic || null,
      phonetics: entry.phonetics || [],
      definitions: [],
      examples: []
    };
    
    if (entry.meanings && Array.isArray(entry.meanings)) {
      for (const meaning of entry.meanings) {
        const partOfSpeech = meaning.partOfSpeech;
        
        if (meaning.definitions && Array.isArray(meaning.definitions)) {
          for (const def of meaning.definitions.slice(0, 3)) {
            result.definitions.push({
              partOfSpeech: partOfSpeech,
              definition: def.definition,
              example: def.example || null
            });
            
            if (def.example) {
              result.examples.push(def.example);
            }
          }
        }
      }
    }
    
    result.simpleTranslation = await translateToChinese(result.word);
    
    return result;
  } catch (error) {
    console.error('词典API请求失败:', error);
    return null;
  }
}

async function translateToChinese(word) {
  try {
    return await handleTranslation(word, 'en', 'zh');
  } catch (e) {
    return null;
  }
}
