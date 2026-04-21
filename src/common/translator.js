const TRANSLATION_CACHE = new Map();

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

async function translateWithLinguee(text, from, to) {
  const url = `https://linguee-api.fly.dev/api/v2/translations?query=${encodeURIComponent(text)}&src=${from}&dst=${to}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0 && data[0].translations) {
      return data[0].translations[0]?.text || text;
    }
    throw new Error('未找到翻译结果');
  } catch (error) {
    console.error('Linguee 翻译失败:', error);
    throw error;
  }
}

async function translateText(text, from, to) {
  if (!text || text.trim().length === 0) {
    return '';
  }
  
  const cacheKey = `${from}|${to}|${text}`;
  if (TRANSLATION_CACHE.has(cacheKey)) {
    return TRANSLATION_CACHE.get(cacheKey);
  }
  
  try {
    let translatedText = await translateWithMyMemory(text, from, to);
    
    if (!translatedText || translatedText === text) {
      translatedText = await translateWithLinguee(text, from, to);
    }
    
    if (translatedText && translatedText !== text) {
      TRANSLATION_CACHE.set(cacheKey, translatedText);
      if (TRANSLATION_CACHE.size > 1000) {
        const firstKey = TRANSLATION_CACHE.keys().next().value;
        TRANSLATION_CACHE.delete(firstKey);
      }
    }
    
    return translatedText;
  } catch (error) {
    console.error('翻译失败:', error);
    return null;
  }
}

async function translateAutoDetect(text, targetLanguage = null) {
  const detectedLang = detectLanguage(text);
  
  let fromLang, toLang;
  
  if (targetLanguage) {
    fromLang = detectedLang;
    toLang = targetLanguage;
  } else {
    if (detectedLang === 'zh') {
      fromLang = 'zh';
      toLang = 'en';
    } else {
      fromLang = 'en';
      toLang = 'zh';
    }
  }
  
  if (fromLang === toLang) {
    return text;
  }
  
  return await translateText(text, fromLang, toLang);
}

async function translateBatch(texts, from, to) {
  const results = [];
  
  for (const text of texts) {
    const translated = await translateText(text, from, to);
    results.push({
      original: text,
      translated: translated
    });
  }
  
  return results;
}
