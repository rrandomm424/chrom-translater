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
  let debounceTimer = null;
  let isInitialized = false;
  
  document.addEventListener('DOMContentLoaded', init);
  
  async function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    await loadSettings();
    setupEventListeners();
    updateUIFromSettings();
    updatePreview();
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
  
  function setupEventListeners() {
    const enableToggle = document.getElementById('enableToggle');
    if (enableToggle) {
      enableToggle.removeEventListener('change', handleToggleChange);
      enableToggle.addEventListener('change', handleToggleChange);
    }
    
    const targetLanguage = document.getElementById('targetLanguage');
    if (targetLanguage) {
      targetLanguage.removeEventListener('change', handleLanguageChange);
      targetLanguage.addEventListener('change', handleLanguageChange);
    }
    
    const translationPosition = document.getElementById('translationPosition');
    if (translationPosition) {
      translationPosition.removeEventListener('change', handlePositionChange);
      translationPosition.addEventListener('change', handlePositionChange);
    }
    
    const boldStyle = document.getElementById('boldStyle');
    if (boldStyle) {
      boldStyle.removeEventListener('change', handleStyleChange);
      boldStyle.addEventListener('change', handleStyleChange);
    }
    
    const underlineStyle = document.getElementById('underlineStyle');
    if (underlineStyle) {
      underlineStyle.removeEventListener('change', handleStyleChange);
      underlineStyle.addEventListener('change', handleStyleChange);
    }
    
    const backgroundColor = document.getElementById('backgroundColor');
    if (backgroundColor) {
      backgroundColor.removeEventListener('input', handleColorInput);
      backgroundColor.removeEventListener('change', handleColorChange);
      backgroundColor.addEventListener('input', handleColorInput);
      backgroundColor.addEventListener('change', handleColorChange);
    }
    
    const textColor = document.getElementById('textColor');
    if (textColor) {
      textColor.removeEventListener('input', handleColorInput);
      textColor.removeEventListener('change', handleColorChange);
      textColor.addEventListener('input', handleColorInput);
      textColor.addEventListener('change', handleColorChange);
    }
    
    const opacitySlider = document.getElementById('opacitySlider');
    if (opacitySlider) {
      opacitySlider.removeEventListener('input', handleOpacityInput);
      opacitySlider.removeEventListener('change', handleOpacityChange);
      opacitySlider.addEventListener('input', handleOpacityInput);
      opacitySlider.addEventListener('change', handleOpacityChange);
    }
    
    const translatePageBtn = document.getElementById('translatePageBtn');
    if (translatePageBtn) {
      translatePageBtn.removeEventListener('click', handleTranslatePage);
      translatePageBtn.addEventListener('click', handleTranslatePage);
    }
    
    const clearTranslationsBtn = document.getElementById('clearTranslationsBtn');
    if (clearTranslationsBtn) {
      clearTranslationsBtn.removeEventListener('click', handleClearTranslations);
      clearTranslationsBtn.addEventListener('click', handleClearTranslations);
    }
    
    const openOptions = document.getElementById('openOptions');
    if (openOptions) {
      openOptions.removeEventListener('click', handleOpenOptions);
      openOptions.addEventListener('click', handleOpenOptions);
    }
    
    const openVocabulary = document.getElementById('openVocabulary');
    if (openVocabulary) {
      openVocabulary.removeEventListener('click', handleOpenVocabulary);
      openVocabulary.addEventListener('click', handleOpenVocabulary);
    }
  }
  
  function updateUIFromSettings() {
    const enableToggle = document.getElementById('enableToggle');
    const statusText = document.getElementById('statusText');
    if (enableToggle && statusText) {
      enableToggle.checked = currentSettings.enabled;
      statusText.textContent = currentSettings.enabled ? '已启用' : '已禁用';
    }
    
    const targetLanguage = document.getElementById('targetLanguage');
    if (targetLanguage) {
      targetLanguage.value = currentSettings.defaultTo;
    }
    
    const translationPosition = document.getElementById('translationPosition');
    if (translationPosition) {
      translationPosition.value = currentSettings.translationPosition;
    }
    
    const boldStyle = document.getElementById('boldStyle');
    if (boldStyle) {
      boldStyle.checked = currentSettings.style.bold;
    }
    
    const underlineStyle = document.getElementById('underlineStyle');
    if (underlineStyle) {
      underlineStyle.checked = currentSettings.style.underline;
    }
    
    const backgroundColor = document.getElementById('backgroundColor');
    const bgPreview = document.getElementById('bgPreview');
    if (backgroundColor) {
      backgroundColor.value = currentSettings.style.backgroundColor;
    }
    if (bgPreview) {
      bgPreview.style.backgroundColor = currentSettings.style.backgroundColor;
    }
    
    const textColor = document.getElementById('textColor');
    const textPreview = document.getElementById('textPreview');
    if (textColor) {
      textColor.value = currentSettings.style.textColor;
    }
    if (textPreview) {
      textPreview.style.backgroundColor = currentSettings.style.textColor;
    }
    
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    if (opacitySlider && opacityValue) {
      opacitySlider.value = Math.round(currentSettings.style.opacity * 100);
      opacityValue.textContent = `${Math.round(currentSettings.style.opacity * 100)}%`;
    }
  }
  
  function updatePreview() {
    const previewText = document.getElementById('previewText');
    if (!previewText) return;
    
    const style = currentSettings.style;
    
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
    
    previewText.style.cssText = cssText;
  }
  
  async function handleToggleChange(event) {
    const isEnabled = event.target.checked;
    const statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = isEnabled ? '已启用' : '已禁用';
    }
    
    currentSettings.enabled = isEnabled;
    await saveSettings();
    
    sendMessageToContentScript({ action: 'toggle-translation' });
  }
  
  async function handleLanguageChange(event) {
    currentSettings.defaultTo = event.target.value;
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-settings', 
      settings: currentSettings 
    });
  }
  
  async function handlePositionChange(event) {
    currentSettings.translationPosition = event.target.value;
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-settings', 
      settings: currentSettings 
    });
  }
  
  async function handleStyleChange() {
    const boldStyle = document.getElementById('boldStyle');
    const underlineStyle = document.getElementById('underlineStyle');
    
    if (boldStyle) {
      currentSettings.style.bold = boldStyle.checked;
    }
    if (underlineStyle) {
      currentSettings.style.underline = underlineStyle.checked;
    }
    
    updatePreview();
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-style-only', 
      style: currentSettings.style 
    });
  }
  
  function handleColorInput(event) {
    const targetId = event.target.id;
    const value = event.target.value;
    
    if (targetId === 'backgroundColor') {
      currentSettings.style.backgroundColor = value;
      const bgPreview = document.getElementById('bgPreview');
      if (bgPreview) {
        bgPreview.style.backgroundColor = value;
      }
    } else if (targetId === 'textColor') {
      currentSettings.style.textColor = value;
      const textPreview = document.getElementById('textPreview');
      if (textPreview) {
        textPreview.style.backgroundColor = value;
      }
    }
    
    updatePreview();
  }
  
  async function handleColorChange(event) {
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-style-only', 
      style: currentSettings.style 
    });
  }
  
  function handleOpacityInput(event) {
    const value = parseInt(event.target.value) / 100;
    const opacityValue = document.getElementById('opacityValue');
    
    currentSettings.style.opacity = value;
    if (opacityValue) {
      opacityValue.textContent = `${event.target.value}%`;
    }
    
    updatePreview();
  }
  
  async function handleOpacityChange(event) {
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-style-only', 
      style: currentSettings.style 
    });
  }
  
  async function handleTranslatePage() {
    const btn = document.getElementById('translatePageBtn');
    if (!btn) return;
    
    const originalText = btn.textContent;
    
    btn.textContent = '翻译中...';
    btn.disabled = true;
    
    try {
      await new Promise((resolve) => {
        sendMessageToContentScript({ action: 'translate-page' }, (response) => {
          resolve(response);
        });
      });
    } catch (e) {
      console.error('翻译页面失败:', e);
    }
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 500);
  }
  
  function handleClearTranslations() {
    sendMessageToContentScript({ action: 'clear-translations' });
  }
  
  function handleOpenOptions(event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  }
  
  function handleOpenVocabulary(event) {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('vocabulary/vocabulary.html') });
  }
  
  async function saveSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        action: 'save-settings', 
        settings: currentSettings 
      }, () => {
        resolve();
      });
    });
  }
  
  function sendMessageToContentScript(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          if (chrome.runtime.lastError) {
            console.log('无法连接到内容脚本:', chrome.runtime.lastError.message);
          }
          if (callback) {
            callback(response);
          }
        });
      } else if (callback) {
        callback(null);
      }
    });
  }
})();
