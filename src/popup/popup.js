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
  
  document.addEventListener('DOMContentLoaded', init);
  
  async function init() {
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
    enableToggle.addEventListener('change', handleToggleChange);
    
    const targetLanguage = document.getElementById('targetLanguage');
    targetLanguage.addEventListener('change', handleLanguageChange);
    
    const translationPosition = document.getElementById('translationPosition');
    translationPosition.addEventListener('change', handlePositionChange);
    
    const boldStyle = document.getElementById('boldStyle');
    boldStyle.addEventListener('change', handleStyleChange);
    
    const underlineStyle = document.getElementById('underlineStyle');
    underlineStyle.addEventListener('change', handleStyleChange);
    
    const backgroundColor = document.getElementById('backgroundColor');
    backgroundColor.addEventListener('input', handleColorChange);
    
    const textColor = document.getElementById('textColor');
    textColor.addEventListener('input', handleColorChange);
    
    const opacitySlider = document.getElementById('opacitySlider');
    opacitySlider.addEventListener('input', handleOpacityChange);
    
    const translatePageBtn = document.getElementById('translatePageBtn');
    translatePageBtn.addEventListener('click', handleTranslatePage);
    
    const clearTranslationsBtn = document.getElementById('clearTranslationsBtn');
    clearTranslationsBtn.addEventListener('click', handleClearTranslations);
    
    const openOptions = document.getElementById('openOptions');
    openOptions.addEventListener('click', handleOpenOptions);
  }
  
  function updateUIFromSettings() {
    const enableToggle = document.getElementById('enableToggle');
    const statusText = document.getElementById('statusText');
    enableToggle.checked = currentSettings.enabled;
    statusText.textContent = currentSettings.enabled ? '已启用' : '已禁用';
    
    const targetLanguage = document.getElementById('targetLanguage');
    targetLanguage.value = currentSettings.defaultTo;
    
    const translationPosition = document.getElementById('translationPosition');
    translationPosition.value = currentSettings.translationPosition;
    
    const boldStyle = document.getElementById('boldStyle');
    boldStyle.checked = currentSettings.style.bold;
    
    const underlineStyle = document.getElementById('underlineStyle');
    underlineStyle.checked = currentSettings.style.underline;
    
    const backgroundColor = document.getElementById('backgroundColor');
    backgroundColor.value = currentSettings.style.backgroundColor;
    
    const bgPreview = document.getElementById('bgPreview');
    bgPreview.style.backgroundColor = currentSettings.style.backgroundColor;
    
    const textColor = document.getElementById('textColor');
    textColor.value = currentSettings.style.textColor;
    
    const textPreview = document.getElementById('textPreview');
    textPreview.style.backgroundColor = currentSettings.style.textColor;
    
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    opacitySlider.value = Math.round(currentSettings.style.opacity * 100);
    opacityValue.textContent = `${Math.round(currentSettings.style.opacity * 100)}%`;
  }
  
  function updatePreview() {
    const previewText = document.getElementById('previewText');
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
    statusText.textContent = isEnabled ? '已启用' : '已禁用';
    
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
    
    currentSettings.style.bold = boldStyle.checked;
    currentSettings.style.underline = underlineStyle.checked;
    
    updatePreview();
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-settings', 
      settings: currentSettings 
    });
  }
  
  async function handleColorChange(event) {
    const targetId = event.target.id;
    const value = event.target.value;
    
    if (targetId === 'backgroundColor') {
      currentSettings.style.backgroundColor = value;
      const bgPreview = document.getElementById('bgPreview');
      bgPreview.style.backgroundColor = value;
    } else if (targetId === 'textColor') {
      currentSettings.style.textColor = value;
      const textPreview = document.getElementById('textPreview');
      textPreview.style.backgroundColor = value;
    }
    
    updatePreview();
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-settings', 
      settings: currentSettings 
    });
  }
  
  async function handleOpacityChange(event) {
    const value = parseInt(event.target.value) / 100;
    const opacityValue = document.getElementById('opacityValue');
    
    currentSettings.style.opacity = value;
    opacityValue.textContent = `${event.target.value}%`;
    
    updatePreview();
    await saveSettings();
    sendMessageToContentScript({ 
      action: 'update-settings', 
      settings: currentSettings 
    });
  }
  
  async function handleTranslatePage() {
    const btn = document.getElementById('translatePageBtn');
    const originalText = btn.textContent;
    
    btn.textContent = '翻译中...';
    btn.disabled = true;
    
    sendMessageToContentScript({ action: 'translate-page' });
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
  
  function handleClearTranslations() {
    sendMessageToContentScript({ action: 'clear-translations' });
  }
  
  function handleOpenOptions(event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
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
  
  function sendMessageToContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, () => {
          if (chrome.runtime.lastError) {
            console.log('无法连接到内容脚本:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
})();
