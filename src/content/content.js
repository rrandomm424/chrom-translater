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
  const TRANSLATION_MAP = new Map();
  const OBSERVER = new MutationObserver(handleMutations);
  const DEBOUNCE_TIMERS = new Map();
  const PROCESSING_NODES = new WeakSet();
  let isObserving = false;
  
  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'textarea', 'input',
    'select', 'option', 'head', 'meta', 'link', 'title',
    'iframe', 'canvas', 'svg', 'video', 'audio',
    'pre', 'code', 'samp', 'kbd', 'var'
  ]);
  
  const SKIP_CLASSES = new Set([
    'translator-extension-translation',
    'translator-extension-wrapper',
    'no-translate',
    'notranslate'
  ]);
  
  let pageLoadComplete = false;
  let currentSelectionInfo = null;
  let selectionDebounceTimer = null;
  let excludeWordsCache = new Set();
  let customTranslationsCache = new Map();
  
  init();
  
  async function init() {
    await loadSettings();
    await loadCaches();
    setupMessageListeners();
    setupSelectionListener();
    
    if (currentSettings.enabled) {
      setupMutationObserver();
      observePage();
      setTimeout(() => {
        pageLoadComplete = true;
        translatePage();
      }, 1000);
    }
  }
  
  async function loadCaches() {
    try {
      await loadExcludeWordsCache();
      await loadCustomTranslationsCache();
    } catch (e) {
      console.warn('加载缓存失败:', e);
    }
  }
  
  async function loadExcludeWordsCache() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'get-exclude-words' },
        (response) => {
          if (response && response.success && response.words) {
            excludeWordsCache = new Set(response.words);
          }
          resolve();
        }
      );
    });
  }
  
  async function loadCustomTranslationsCache() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'get-custom-translations' },
        (response) => {
          if (response && response.success && response.customTranslations) {
            customTranslationsCache = new Map();
            for (const [key, value] of Object.entries(response.customTranslations)) {
              customTranslationsCache.set(key, value.customTranslation);
            }
          }
          resolve();
        }
      );
    });
  }
  
  function setupSelectionListener() {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
  }
  
  function handleMouseUp(event) {
    if (event.target.closest('#translator-extension-popup')) {
      return;
    }
    
    clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text && text.length > 0 && isValidTranslationText(text)) {
        handleTextSelection(text, selection);
      } else if (!text) {
        hideTranslationPopup();
      }
    }, 200);
  }
  
  function handleKeyUp(event) {
    if (event.key === 'Escape') {
      hideTranslationPopup();
    }
  }
  
  function hideTranslationPopup() {
    const popup = document.getElementById('translator-extension-popup');
    if (popup) {
      popup.remove();
    }
    currentSelectionInfo = null;
  }
  
  async function handleTextSelection(text, selection) {
    if (!currentSettings.enabled) return;
    
    const detectedLang = detectLanguage(text);
    let targetLang = currentSettings.defaultTo;
    
    if (targetLang === 'auto') {
      targetLang = detectedLang === 'zh' ? 'en' : 'zh';
    }
    
    if (detectedLang === targetLang) {
      return;
    }
    
    currentSelectionInfo = {
      original: text,
      from: detectedLang,
      to: targetLang,
      selection: selection
    };
    
    showTranslationPopupWithLoading();
    
    const customTranslation = await getCustomTranslationFromBackground(text, detectedLang, targetLang);
    const isExcluded = await checkWordExcluded(text);
    
    if (isExcluded) {
      hideTranslationPopup();
      return;
    }
    
    const isSingleWord = isSingleWordText(text, detectedLang);
    
    if (isSingleWord) {
      const wordDefinition = await getWordDefinitionFromBackground(text, detectedLang);
      
      if (wordDefinition && wordDefinition.definitions && wordDefinition.definitions.length > 0) {
        currentSelectionInfo.translation = wordDefinition.simpleTranslation || wordDefinition.definitions[0].definition;
        currentSelectionInfo.definition = wordDefinition;
        showTranslationPopupWithDefinition(wordDefinition, customTranslation !== null);
        return;
      }
    }
    
    let translatedText = customTranslation;
    if (!translatedText) {
      translatedText = await sendTranslationRequest(text, detectedLang, targetLang);
    }
    
    if (translatedText) {
      currentSelectionInfo.translation = translatedText;
      showTranslationPopupEnhanced(translatedText, customTranslation !== null);
    } else {
      hideTranslationPopup();
    }
  }
  
  async function getWordDefinitionFromBackground(word, lang) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'get-word-definition', word, lang },
        (response) => {
          if (response && response.success && response.definition) {
            resolve(response.definition);
          } else {
            resolve(null);
          }
        }
      );
    });
  }
  
  async function getCustomTranslationFromBackground(text, from, to) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'get-custom-translation', text, from, to },
        (response) => {
          if (response && response.success) {
            resolve(response.customTranslation);
          } else {
            resolve(null);
          }
        }
      );
    });
  }
  
  async function checkWordExcluded(word) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'is-word-excluded', word },
        (response) => {
          if (response && response.success) {
            resolve(response.excluded);
          } else {
            resolve(false);
          }
        }
      );
    });
  }
  
  function showTranslationPopupWithLoading() {
    const existingPopup = document.getElementById('translator-extension-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.id = 'translator-extension-popup';
    popup.className = 'translator-extension-popup';
    
    popup.innerHTML = `
      <div class="translator-extension-popup-header">
        <span>翻译中...</span>
        <button class="translator-extension-close-btn">×</button>
      </div>
      <div class="translator-extension-popup-content translator-extension-loading"></div>
    `;
    
    positionPopup(popup);
    
    const closeBtn = popup.querySelector('.translator-extension-close-btn');
    closeBtn.onclick = () => hideTranslationPopup();
    
    document.body.appendChild(popup);
  }
  
  function positionPopup(popup) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      popup.style.position = 'fixed';
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.bottom + 10}px`;
      popup.style.zIndex = '999999';
      
      setTimeout(() => {
        const popupRect = popup.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (popupRect.right > viewportWidth - 20) {
          popup.style.left = `${viewportWidth - popupRect.width - 20}px`;
        }
        
        if (popupRect.bottom > viewportHeight - 20) {
          popup.style.top = `${rect.top - popupRect.height - 10}px`;
        }
      }, 0);
    }
  }
  
  function getPartOfSpeechCN(pos) {
    const posMap = {
      'noun': '名词',
      'verb': '动词',
      'adjective': '形容词',
      'adverb': '副词',
      'preposition': '介词',
      'conjunction': '连词',
      'pronoun': '代词',
      'interjection': '感叹词',
      'determiner': '限定词',
      'numeral': '数词',
      'article': '冠词'
    };
    return posMap[pos] || pos;
  }
  
  async function showTranslationPopupWithDefinition(definition, isCustom = false) {
    const existingPopup = document.getElementById('translator-extension-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    if (!currentSelectionInfo) return;
    
    const popup = document.createElement('div');
    popup.id = 'translator-extension-popup';
    popup.className = 'translator-extension-popup translator-extension-popup-large';
    
    const isInVocab = await checkWordInVocabulary(currentSelectionInfo.original);
    
    const styleString = generateStyleString(currentSettings.style);
    const customBadge = isCustom ? '<span class="translator-extension-custom-badge">自定义</span>' : '';
    const favIcon = isInVocab ? '★' : '☆';
    const favClass = isInVocab ? 'active' : '';
    
    const phoneticDisplay = definition.phonetic 
      ? `<span class="translator-extension-phonetic">${escapeHtml(definition.phonetic)}</span>` 
      : '';
    
    let definitionsHtml = '';
    const groupedDefinitions = {};
    
    if (definition.definitions && definition.definitions.length > 0) {
      for (const def of definition.definitions) {
        const pos = def.partOfSpeech;
        if (!groupedDefinitions[pos]) {
          groupedDefinitions[pos] = [];
        }
        groupedDefinitions[pos].push(def);
      }
      
      for (const [pos, defs] of Object.entries(groupedDefinitions)) {
        const posCN = getPartOfSpeechCN(pos);
        definitionsHtml += `
          <div class="translator-extension-def-group">
            <div class="translator-extension-pos">
              <span class="translator-extension-pos-en">${escapeHtml(pos)}</span>
              <span class="translator-extension-pos-cn">${escapeHtml(posCN)}</span>
            </div>
            <div class="translator-extension-def-list">
        `;
        
        for (let i = 0; i < defs.length; i++) {
          const def = defs[i];
          const exampleHtml = def.example 
            ? `<div class="translator-extension-example">「例」${escapeHtml(def.example)}</div>` 
            : '';
          
          definitionsHtml += `
            <div class="translator-extension-def-item">
              <span class="translator-extension-def-num">${i + 1}.</span>
              <span class="translator-extension-def-text">${escapeHtml(def.definition)}</span>
              ${exampleHtml}
            </div>
          `;
        }
        
        definitionsHtml += `
            </div>
          </div>
        `;
      }
    }
    
    const simpleTranslationHtml = definition.simpleTranslation 
      ? `<div class="translator-extension-simple-trans" style="${styleString}">${escapeHtml(definition.simpleTranslation)}</div>` 
      : '';
    
    popup.innerHTML = `
      <div class="translator-extension-popup-header">
        <div class="translator-extension-popup-title">
          <span>📚 单词释义</span>
          ${customBadge}
        </div>
        <button class="translator-extension-close-btn">×</button>
      </div>
      <div class="translator-extension-popup-original translator-extension-word-header">
        <div class="translator-extension-word-main">
          <span class="translator-extension-word">${escapeHtml(definition.word || currentSelectionInfo.original)}</span>
          ${phoneticDisplay}
        </div>
        ${simpleTranslationHtml}
      </div>
      ${definitionsHtml ? `<div class="translator-extension-popup-divider"></div>` : ''}
      ${definitionsHtml}
      <div class="translator-extension-popup-divider"></div>
      <div class="translator-extension-popup-actions">
        <button class="translator-extension-action-btn translator-extension-fav-btn ${favClass}" data-action="favorite" title="收藏到词库">
          <span class="translator-extension-action-icon">${favIcon}</span>
          <span>收藏</span>
        </button>
        <button class="translator-extension-action-btn" data-action="exclude" title="不翻译此单词">
          <span class="translator-extension-action-icon">🚫</span>
          <span>不翻译</span>
        </button>
        <button class="translator-extension-action-btn" data-action="custom" title="自定义翻译结果">
          <span class="translator-extension-action-icon">✏️</span>
          <span>自定义</span>
        </button>
      </div>
      <div class="translator-extension-custom-editor" style="display: none;">
        <textarea class="translator-extension-custom-input" placeholder="输入自定义翻译结果...">${escapeHtml(definition.simpleTranslation || '')}</textarea>
        <div class="translator-extension-custom-actions">
          <button class="translator-extension-custom-save">保存</button>
          <button class="translator-extension-custom-cancel">取消</button>
        </div>
      </div>
    `;
    
    positionPopup(popup);
    
    const closeBtn = popup.querySelector('.translator-extension-close-btn');
    closeBtn.onclick = () => hideTranslationPopup();
    
    const actionBtns = popup.querySelectorAll('.translator-extension-action-btn');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        await handlePopupAction(action, popup);
      });
    });
    
    const customEditor = popup.querySelector('.translator-extension-custom-editor');
    const customInput = popup.querySelector('.translator-extension-custom-input');
    const saveBtn = popup.querySelector('.translator-extension-custom-save');
    const cancelBtn = popup.querySelector('.translator-extension-custom-cancel');
    
    saveBtn.addEventListener('click', async () => {
      const customText = customInput.value.trim();
      if (customText && currentSelectionInfo) {
        await saveCustomTranslation(customText);
        const newDefinition = {
          ...definition,
          simpleTranslation: customText
        };
        showTranslationPopupWithDefinition(newDefinition, true);
      }
    });
    
    cancelBtn.addEventListener('click', () => {
      customEditor.style.display = 'none';
    });
    
    document.body.appendChild(popup);
    
    setupPopupCloseListener(popup);
  }
  
  async function showTranslationPopupEnhanced(translatedText, isCustom = false) {
    const existingPopup = document.getElementById('translator-extension-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    if (!currentSelectionInfo) return;
    
    const popup = document.createElement('div');
    popup.id = 'translator-extension-popup';
    popup.className = 'translator-extension-popup';
    
    const isInVocab = await checkWordInVocabulary(currentSelectionInfo.original);
    
    const styleString = generateStyleString(currentSettings.style);
    const customBadge = isCustom ? '<span class="translator-extension-custom-badge">自定义</span>' : '';
    const favIcon = isInVocab ? '★' : '☆';
    const favClass = isInVocab ? 'active' : '';
    
    popup.innerHTML = `
      <div class="translator-extension-popup-header">
        <div class="translator-extension-popup-title">
          <span>翻译结果</span>
          ${customBadge}
        </div>
        <button class="translator-extension-close-btn">×</button>
      </div>
      <div class="translator-extension-popup-original">
        <span class="translator-extension-label">原文:</span>
        <span class="translator-extension-original-text">${escapeHtml(currentSelectionInfo.original)}</span>
        <span class="translator-extension-lang">(${currentSelectionInfo.from === 'zh' ? '中文' : 'English'})</span>
      </div>
      <div class="translator-extension-popup-divider"></div>
      <div class="translator-extension-popup-translation">
        <span class="translator-extension-label">译文:</span>
        <div class="translator-extension-translation-text" style="${styleString}">${escapeHtml(translatedText)}</div>
      </div>
      <div class="translator-extension-popup-divider"></div>
      <div class="translator-extension-popup-actions">
        <button class="translator-extension-action-btn translator-extension-fav-btn ${favClass}" data-action="favorite" title="收藏到词库">
          <span class="translator-extension-action-icon">${favIcon}</span>
          <span>收藏</span>
        </button>
        <button class="translator-extension-action-btn" data-action="exclude" title="不翻译此单词">
          <span class="translator-extension-action-icon">🚫</span>
          <span>不翻译</span>
        </button>
        <button class="translator-extension-action-btn" data-action="custom" title="自定义翻译结果">
          <span class="translator-extension-action-icon">✏️</span>
          <span>自定义</span>
        </button>
      </div>
      <div class="translator-extension-custom-editor" style="display: none;">
        <textarea class="translator-extension-custom-input" placeholder="输入自定义翻译结果...">${escapeHtml(translatedText)}</textarea>
        <div class="translator-extension-custom-actions">
          <button class="translator-extension-custom-save">保存</button>
          <button class="translator-extension-custom-cancel">取消</button>
        </div>
      </div>
    `;
    
    positionPopup(popup);
    
    const closeBtn = popup.querySelector('.translator-extension-close-btn');
    closeBtn.onclick = () => hideTranslationPopup();
    
    const actionBtns = popup.querySelectorAll('.translator-extension-action-btn');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        await handlePopupAction(action, popup);
      });
    });
    
    const customEditor = popup.querySelector('.translator-extension-custom-editor');
    const customInput = popup.querySelector('.translator-extension-custom-input');
    const saveBtn = popup.querySelector('.translator-extension-custom-save');
    const cancelBtn = popup.querySelector('.translator-extension-custom-cancel');
    
    saveBtn.addEventListener('click', async () => {
      const customText = customInput.value.trim();
      if (customText && currentSelectionInfo) {
        await saveCustomTranslation(customText);
        showTranslationPopupEnhanced(customText, true);
      }
    });
    
    cancelBtn.addEventListener('click', () => {
      customEditor.style.display = 'none';
    });
    
    document.body.appendChild(popup);
    
    setupPopupCloseListener(popup);
  }
  
  function setupPopupCloseListener(popup) {
    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target)) {
          if (popup.parentNode) {
            popup.remove();
          }
          document.removeEventListener('click', closePopup);
        }
      });
    }, 100);
  }
  
  async function handlePopupAction(action, popup) {
    if (!currentSelectionInfo) return;
    
    switch (action) {
      case 'favorite':
        await toggleFavorite(popup);
        break;
      case 'exclude':
        await excludeCurrentWord();
        break;
      case 'custom':
        showCustomEditor(popup);
        break;
    }
  }
  
  async function toggleFavorite(popup) {
    if (!currentSelectionInfo) return;
    
    const { original, translation, from, to } = currentSelectionInfo;
    const isInVocab = await checkWordInVocabulary(original);
    
    if (isInVocab) {
      await removeFromVocabularyBackground(original);
    } else {
      await addToVocabularyBackground(original, translation, from, to);
    }
    
    const newIsInVocab = await checkWordInVocabulary(original);
    const favBtn = popup.querySelector('.translator-extension-fav-btn');
    const favIcon = favBtn.querySelector('.translator-extension-action-icon');
    
    if (newIsInVocab) {
      favBtn.classList.add('active');
      favIcon.textContent = '★';
    } else {
      favBtn.classList.remove('active');
      favIcon.textContent = '☆';
    }
  }
  
  async function checkWordInVocabulary(word) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'is-word-in-vocabulary', word },
        (response) => {
          if (response && response.success) {
            resolve(response.inVocabulary);
          } else {
            resolve(false);
          }
        }
      );
    });
  }
  
  async function addToVocabularyBackground(word, translation, from, to) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'add-to-vocabulary', word, translation, from, to },
        (response) => {
          resolve(response && response.success);
        }
      );
    });
  }
  
  async function removeFromVocabularyBackground(word) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'remove-from-vocabulary', word },
        (response) => {
          resolve(response && response.success);
        }
      );
    });
  }
  
  async function excludeCurrentWord() {
    if (!currentSelectionInfo) return;
    
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'add-exclude-word', word: currentSelectionInfo.original },
        () => {
          resolve();
        }
      );
    });
    
    hideTranslationPopup();
  }
  
  async function saveCustomTranslation(customText) {
    if (!currentSelectionInfo) return;
    
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'add-custom-translation', 
          original: currentSelectionInfo.original,
          customTranslation: customText,
          from: currentSelectionInfo.from,
          to: currentSelectionInfo.to
        },
        () => {
          resolve();
        }
      );
    });
  }
  
  function showCustomEditor(popup) {
    const customEditor = popup.querySelector('.translator-extension-custom-editor');
    if (customEditor) {
      customEditor.style.display = 'block';
      const input = customEditor.querySelector('.translator-extension-custom-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        handleUpdateSettings(request.settings);
        sendResponse({ success: true });
      } else if (request.action === 'update-style-only') {
        handleUpdateStyleOnly(request.style);
        sendResponse({ success: true });
      } else if (request.action === 'translate-selection') {
        translateSelectedText(request.text);
        sendResponse({ success: true });
      } else if (request.action === 'translate-page') {
        const result = translatePage();
        sendResponse({ success: true, result: result });
      } else if (request.action === 'clear-translations') {
        removeAllTranslations();
        sendResponse({ success: true });
      }
      return true;
    });
  }
  
  function handleUpdateSettings(newSettings) {
    const oldTranslationPosition = currentSettings.translationPosition;
    currentSettings = { ...currentSettings, ...newSettings };
    
    if (currentSettings.enabled) {
      if (currentSettings.translationPosition !== oldTranslationPosition) {
        refreshTranslations();
      } else {
        updateAllTranslationStyles();
      }
    } else {
      removeAllTranslations();
    }
  }
  
  function handleUpdateStyleOnly(newStyle) {
    currentSettings.style = { ...currentSettings.style, ...newStyle };
    updateAllTranslationStyles();
  }
  
  function setupMutationObserver() {
    OBSERVER.disconnect();
    isObserving = false;
  }
  
  function observePage() {
    if (isObserving) return;
    
    OBSERVER.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    isObserving = true;
  }
  
  function pauseObserver() {
    if (isObserving) {
      OBSERVER.disconnect();
      isObserving = false;
    }
  }
  
  function resumeObserver() {
    if (!isObserving && currentSettings.enabled) {
      observePage();
    }
  }
  
  function handleMutations(mutations) {
    if (!currentSettings.enabled) return;
    if (!pageLoadComplete) return;
    
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
              if (!node.classList || !node.classList.contains('translator-extension-translation')) {
                collectTranslatableElements(node, changedElements);
              }
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
    }, 800));
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
    const timerKey = `element-${getElementId(element)}`;
    if (DEBOUNCE_TIMERS.has(timerKey)) {
      clearTimeout(DEBOUNCE_TIMERS.get(timerKey));
    }
    
    DEBOUNCE_TIMERS.set(timerKey, setTimeout(() => {
      translateElement(element);
    }, 500));
  }
  
  function getElementId(element) {
    if (element.id) return element.id;
    if (element.dataset && element.dataset.translatorId) return element.dataset.translatorId;
    
    const id = 'translator-' + Math.random().toString(36).substr(2, 9);
    if (element.dataset) {
      element.dataset.translatorId = id;
    }
    return id;
  }
  
  function toggleTranslation() {
    currentSettings.enabled = !currentSettings.enabled;
    
    if (currentSettings.enabled) {
      observePage();
      translatePage();
    } else {
      pauseObserver();
      removeAllTranslations();
    }
  }
  
  function removeAllTranslations() {
    pauseObserver();
    
    const translations = document.querySelectorAll('.translator-extension-translation');
    const breaks = document.querySelectorAll('.translator-extension-break');
    
    translations.forEach(el => {
      el.remove();
    });
    
    breaks.forEach(el => el.remove());
    
    TRANSLATION_MAP.clear();
    
    resumeObserver();
  }
  
  function removeTranslationById(nodeId) {
    const translationInfo = TRANSLATION_MAP.get(nodeId);
    if (translationInfo) {
      if (translationInfo.breakElement && translationInfo.breakElement.parentNode) {
        translationInfo.breakElement.remove();
      }
      if (translationInfo.translationElement && translationInfo.translationElement.parentNode) {
        translationInfo.translationElement.remove();
      }
      TRANSLATION_MAP.delete(nodeId);
    }
  }
  
  function refreshTranslations() {
    removeAllTranslations();
    translatePage();
  }
  
  function updateAllTranslationStyles() {
    const translations = document.querySelectorAll('.translator-extension-translation');
    const styleString = generateStyleString(currentSettings.style);
    
    translations.forEach(el => {
      el.style.cssText = styleString;
    });
  }
  
  function translatePage() {
    if (!currentSettings.enabled) return false;
    
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
    
    processTranslationBatch(batch);
    
    return true;
  }
  
  async function processTranslationBatch(batch) {
    for (const item of batch) {
      await translateTextNode(item.element, item.textNode, item.text);
    }
  }
  
  function collectPageElements() {
    const elements = [];
    const selector = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
    
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
    
    if (element.classList) {
      for (const className of SKIP_CLASSES) {
        if (element.classList.contains(className)) return false;
      }
    }
    
    const parent = element.parentElement;
    if (parent && parent.classList && parent.classList.contains('translator-extension-wrapper')) {
      return false;
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
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && parent.classList && parent.classList.contains('translator-extension-translation')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
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
    if (PROCESSING_NODES.has(textNode)) return;
    
    const nodeId = getTextNodeId(textNode);
    const existingTranslation = TRANSLATION_MAP.get(nodeId);
    if (existingTranslation) {
      return;
    }
    
    PROCESSING_NODES.add(textNode);
    
    try {
      const detectedLang = detectLanguage(text);
      let targetLang = currentSettings.defaultTo;
      
      if (targetLang === 'auto') {
        targetLang = detectedLang === 'zh' ? 'en' : 'zh';
      }
      
      if (detectedLang === targetLang) {
        return;
      }
      
      if (isTextExcluded(text, detectedLang)) {
        return;
      }
      
      const customTranslation = getCachedCustomTranslation(text, detectedLang, targetLang);
      if (customTranslation) {
        if (customTranslation !== text) {
          insertTranslation(textNode, nodeId, customTranslation);
        }
        return;
      }
      
      const cacheKey = `${detectedLang}|${targetLang}|${text}`;
      let translatedText = TRANSLATION_CACHE.get(cacheKey);
      
      if (!translatedText) {
        translatedText = await translateTextWithCustomCheck(text, detectedLang, targetLang);
        if (translatedText) {
          TRANSLATION_CACHE.set(cacheKey, translatedText);
        }
      }
      
      if (translatedText && translatedText !== text) {
        insertTranslation(textNode, nodeId, translatedText);
      }
    } finally {
      PROCESSING_NODES.delete(textNode);
    }
  }
  
  function isTextExcluded(text, lang) {
    const trimmedText = text.trim().toLowerCase();
    
    if (excludeWordsCache.has(trimmedText)) {
      return true;
    }
    
    const words = extractWords(text, lang);
    for (const word of words) {
      if (excludeWordsCache.has(word.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }
  
  function extractWords(text, lang) {
    if (lang === 'zh') {
      return [text.trim()];
    }
    
    const matches = text.match(/[a-zA-Z]+/g);
    return matches ? matches : [text.trim()];
  }
  
  function getCachedCustomTranslation(text, from, to) {
    const key = `${from}|${to}|${text.toLowerCase()}`;
    return customTranslationsCache.get(key) || null;
  }
  
  async function translateTextWithCustomCheck(text, from, to) {
    const isSingleWord = isSingleWordText(text, from);
    
    if (isSingleWord) {
      const customTranslation = getCachedCustomTranslation(text, from, to);
      if (customTranslation) {
        return customTranslation;
      }
    }
    
    const words = extractWords(text, from);
    let hasCustomWords = false;
    const customWordTranslations = new Map();
    
    for (const word of words) {
      const custom = getCachedCustomTranslation(word, from, to);
      if (custom) {
        hasCustomWords = true;
        customWordTranslations.set(word.toLowerCase(), custom);
      }
    }
    
    if (hasCustomWords && customWordTranslations.size > 0) {
      return await translateWithCustomWords(text, from, to, customWordTranslations);
    }
    
    return await sendTranslationRequest(text, from, to);
  }
  
  function isSingleWordText(text, lang) {
    const trimmed = text.trim();
    
    if (lang === 'zh') {
      return trimmed.length >= 1 && !trimmed.includes(' ') && !trimmed.includes('，') && !trimmed.includes('。');
    }
    
    const englishWords = trimmed.match(/[a-zA-Z]+/g);
    return englishWords && englishWords.length === 1;
  }
  
  async function translateWithCustomWords(text, from, to, customWordTranslations) {
    const baseTranslation = await sendTranslationRequest(text, from, to);
    
    if (!baseTranslation) {
      return null;
    }
    
    let result = baseTranslation;
    for (const [word, customTranslation] of customWordTranslations) {
      const regex = new RegExp(escapeRegExp(word), 'gi');
      result = result.replace(regex, customTranslation);
    }
    
    return result;
  }
  
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  function getTextNodeId(textNode) {
    const parent = textNode.parentElement;
    if (!parent) return 'node-' + Math.random().toString(36).substr(2, 9);
    
    let index = 0;
    const childNodes = parent.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      if (childNodes[i] === textNode) {
        index = i;
        break;
      }
    }
    
    const parentId = getElementId(parent);
    return `${parentId}-text-${index}`;
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
  
  function insertTranslation(textNode, nodeId, translatedText) {
    try {
      const parent = textNode.parentElement;
      if (!parent) return;
      
      const styleString = generateStyleString(currentSettings.style);
      
      const translationSpan = document.createElement('span');
      translationSpan.className = 'translator-extension-translation';
      translationSpan.style.cssText = styleString;
      translationSpan.textContent = translatedText;
      translationSpan.dataset.nodeId = nodeId;
      
      let breakElement = null;
      if (currentSettings.translationPosition === 'below') {
        breakElement = document.createElement('br');
        breakElement.className = 'translator-extension-break';
        breakElement.dataset.nodeId = nodeId;
      }
      
      const nextSibling = textNode.nextSibling;
      
      pauseObserver();
      
      if (breakElement) {
        if (nextSibling) {
          parent.insertBefore(breakElement, nextSibling);
          parent.insertBefore(translationSpan, nextSibling);
        } else {
          parent.appendChild(breakElement);
          parent.appendChild(translationSpan);
        }
      } else {
        if (nextSibling) {
          parent.insertBefore(translationSpan, nextSibling);
        } else {
          parent.appendChild(translationSpan);
        }
      }
      
      TRANSLATION_MAP.set(nodeId, {
        translationElement: translationSpan,
        breakElement: breakElement,
        translatedText: translatedText,
        originalText: textNode.textContent
      });
      
      resumeObserver();
      
    } catch (e) {
      console.warn('插入翻译失败:', e);
      resumeObserver();
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
    let cssText = 'display: inline-block; margin: 0 4px; padding: 1px 4px; border-radius: 2px; font-size: inherit; line-height: inherit; vertical-align: baseline;';
    
    if (style.bold) {
      cssText += ' font-weight: bold;';
    }
    if (style.underline) {
      cssText += ' text-decoration: underline;';
    }
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
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
