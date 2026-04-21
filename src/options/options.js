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
  
  const STYLE_PRESETS = {
    yellow: {
      bold: false,
      underline: false,
      backgroundColor: '#fff3cd',
      textColor: '#856404',
      opacity: 1
    },
    blue: {
      bold: false,
      underline: false,
      backgroundColor: '#cce5ff',
      textColor: '#004085',
      opacity: 1
    },
    green: {
      bold: false,
      underline: false,
      backgroundColor: '#d4edda',
      textColor: '#155724',
      opacity: 1
    },
    red: {
      bold: false,
      underline: false,
      backgroundColor: '#f8d7da',
      textColor: '#721c24',
      opacity: 1
    },
    dark: {
      bold: false,
      underline: false,
      backgroundColor: '#343a40',
      textColor: '#ffffff',
      opacity: 1
    },
    minimal: {
      bold: false,
      underline: true,
      backgroundColor: 'transparent',
      textColor: '#667eea',
      opacity: 1
    }
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
    const autoDetect = document.getElementById('autoDetect');
    autoDetect.addEventListener('change', handleSettingChange);
    
    const defaultFrom = document.getElementById('defaultFrom');
    defaultFrom.addEventListener('change', handleSettingChange);
    
    const defaultTo = document.getElementById('defaultTo');
    defaultTo.addEventListener('change', handleSettingChange);
    
    const showOriginal = document.getElementById('showOriginal');
    showOriginal.addEventListener('change', handleSettingChange);
    
    const translationPosition = document.getElementById('translationPosition');
    translationPosition.addEventListener('change', handleSettingChange);
    
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
    
    const addDomainBtn = document.getElementById('addDomainBtn');
    addDomainBtn.addEventListener('click', handleAddDomain);
    
    const newDomain = document.getElementById('newDomain');
    newDomain.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAddDomain();
      }
    });
    
    const presetGrid = document.getElementById('presetGrid');
    presetGrid.addEventListener('click', handlePresetClick);
    
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.addEventListener('click', handleSave);
    
    const resetBtn = document.getElementById('resetBtn');
    resetBtn.addEventListener('click', handleReset);
  }
  
  function updateUIFromSettings() {
    const autoDetect = document.getElementById('autoDetect');
    autoDetect.checked = currentSettings.autoDetect;
    
    const defaultFrom = document.getElementById('defaultFrom');
    defaultFrom.value = currentSettings.defaultFrom;
    
    const defaultTo = document.getElementById('defaultTo');
    defaultTo.value = currentSettings.defaultTo;
    
    const showOriginal = document.getElementById('showOriginal');
    showOriginal.checked = currentSettings.showOriginal;
    
    const translationPosition = document.getElementById('translationPosition');
    translationPosition.value = currentSettings.translationPosition;
    
    const boldStyle = document.getElementById('boldStyle');
    boldStyle.checked = currentSettings.style.bold;
    
    const underlineStyle = document.getElementById('underlineStyle');
    underlineStyle.checked = currentSettings.style.underline;
    
    const backgroundColor = document.getElementById('backgroundColor');
    backgroundColor.value = currentSettings.style.backgroundColor;
    
    const bgHex = document.getElementById('bgHex');
    bgHex.textContent = currentSettings.style.backgroundColor;
    
    const textColor = document.getElementById('textColor');
    textColor.value = currentSettings.style.textColor;
    
    const textHex = document.getElementById('textHex');
    textHex.textContent = currentSettings.style.textColor;
    
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    opacitySlider.value = Math.round(currentSettings.style.opacity * 100);
    opacityValue.textContent = `${Math.round(currentSettings.style.opacity * 100)}%`;
    
    updateDomainList();
    updateActivePreset();
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
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
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
  
  function updateDomainList() {
    const domainList = document.getElementById('domainList');
    const domains = currentSettings.excludeDomains || [];
    
    if (domains.length === 0) {
      domainList.innerHTML = '<p class="empty-list">暂无排除的网站</p>';
      return;
    }
    
    domainList.innerHTML = domains.map((domain, index) => `
      <div class="domain-item" data-index="${index}">
        <span class="domain-name">${domain}</span>
        <button class="remove-domain" data-index="${index}">移除</button>
      </div>
    `).join('');
    
    const removeButtons = domainList.querySelectorAll('.remove-domain');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        handleRemoveDomain(index);
      });
    });
  }
  
  function updateActivePreset() {
    const presetItems = document.querySelectorAll('.preset-item');
    presetItems.forEach(item => {
      item.classList.remove('active');
      const presetName = item.dataset.preset;
      const preset = STYLE_PRESETS[presetName];
      
      if (preset && 
          currentSettings.style.bold === preset.bold &&
          currentSettings.style.underline === preset.underline &&
          currentSettings.style.backgroundColor === preset.backgroundColor &&
          currentSettings.style.textColor === preset.textColor &&
          currentSettings.style.opacity === preset.opacity) {
        item.classList.add('active');
      }
    });
  }
  
  function handleSettingChange() {
    const autoDetect = document.getElementById('autoDetect');
    const defaultFrom = document.getElementById('defaultFrom');
    const defaultTo = document.getElementById('defaultTo');
    const showOriginal = document.getElementById('showOriginal');
    const translationPosition = document.getElementById('translationPosition');
    
    currentSettings.autoDetect = autoDetect.checked;
    currentSettings.defaultFrom = defaultFrom.value;
    currentSettings.defaultTo = defaultTo.value;
    currentSettings.showOriginal = showOriginal.checked;
    currentSettings.translationPosition = translationPosition.value;
  }
  
  function handleStyleChange() {
    const boldStyle = document.getElementById('boldStyle');
    const underlineStyle = document.getElementById('underlineStyle');
    
    currentSettings.style.bold = boldStyle.checked;
    currentSettings.style.underline = underlineStyle.checked;
    
    updatePreview();
    updateActivePreset();
  }
  
  function handleColorChange(event) {
    const targetId = event.target.id;
    const value = event.target.value;
    
    if (targetId === 'backgroundColor') {
      currentSettings.style.backgroundColor = value;
      const bgHex = document.getElementById('bgHex');
      bgHex.textContent = value;
    } else if (targetId === 'textColor') {
      currentSettings.style.textColor = value;
      const textHex = document.getElementById('textHex');
      textHex.textContent = value;
    }
    
    updatePreview();
    updateActivePreset();
  }
  
  function handleOpacityChange(event) {
    const value = parseInt(event.target.value) / 100;
    const opacityValue = document.getElementById('opacityValue');
    
    currentSettings.style.opacity = value;
    opacityValue.textContent = `${event.target.value}%`;
    
    updatePreview();
    updateActivePreset();
  }
  
  function handleAddDomain() {
    const newDomain = document.getElementById('newDomain');
    const domain = newDomain.value.trim();
    
    if (!domain) {
      showToast('请输入域名', 'error');
      return;
    }
    
    if (currentSettings.excludeDomains.includes(domain)) {
      showToast('该域名已存在', 'error');
      return;
    }
    
    currentSettings.excludeDomains.push(domain);
    newDomain.value = '';
    updateDomainList();
    showToast('域名已添加');
  }
  
  function handleRemoveDomain(index) {
    currentSettings.excludeDomains.splice(index, 1);
    updateDomainList();
    showToast('域名已移除');
  }
  
  function handlePresetClick(event) {
    const presetItem = event.target.closest('.preset-item');
    if (!presetItem) return;
    
    const presetName = presetItem.dataset.preset;
    const preset = STYLE_PRESETS[presetName];
    
    if (!preset) return;
    
    currentSettings.style = { ...preset };
    updateUIFromSettings();
    updatePreview();
    showToast('样式已应用');
  }
  
  async function handleSave() {
    try {
      await saveSettings();
      showToast('设置已保存', 'success');
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'update-settings', 
            settings: currentSettings 
          }, () => {
            if (chrome.runtime.lastError) {
              console.log('无法连接到内容脚本');
            }
          });
        }
      });
    } catch (error) {
      showToast('保存失败: ' + error.message, 'error');
    }
  }
  
  async function handleReset() {
    if (!confirm('确定要恢复默认设置吗？')) {
      return;
    }
    
    currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    updateUIFromSettings();
    updatePreview();
    await saveSettings();
    showToast('已恢复默认设置');
  }
  
  async function saveSettings() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'save-settings', 
        settings: currentSettings 
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
  
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.className = 'toast';
    
    if (type === 'success') {
      toast.classList.add('success');
    } else if (type === 'error') {
      toast.classList.add('error');
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
})();
