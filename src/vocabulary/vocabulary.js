(function() {
  'use strict';
  
  let currentVocabulary = [];
  let currentExcludeWords = [];
  let editingId = null;
  
  document.addEventListener('DOMContentLoaded', init);
  
  async function init() {
    setupEventListeners();
    await loadData();
  }
  
  function setupEventListeners() {
    const navVocabulary = document.getElementById('navVocabulary');
    const navExclude = document.getElementById('navExclude');
    
    navVocabulary.addEventListener('click', () => {
      showSection('vocabulary');
      navVocabulary.classList.add('active');
      navExclude.classList.remove('active');
    });
    
    navExclude.addEventListener('click', () => {
      showSection('exclude');
      navExclude.classList.add('active');
      navVocabulary.classList.remove('active');
    });
    
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.addEventListener('click', handleExport);
    
    const clearAllBtn = document.getElementById('clearAllBtn');
    clearAllBtn.addEventListener('click', handleClearAll);
    
    const addExcludeBtn = document.getElementById('addExcludeBtn');
    addExcludeBtn.addEventListener('click', handleAddExclude);
    
    const newExcludeInput = document.getElementById('newExcludeInput');
    newExcludeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAddExclude();
      }
    });
    
    const modalClose = document.querySelector('.modal-close');
    modalClose.addEventListener('click', closeModal);
    
    const modalCancel = document.querySelector('.modal-cancel');
    modalCancel.addEventListener('click', closeModal);
    
    const modalSave = document.querySelector('.modal-save');
    modalSave.addEventListener('click', handleSaveNotes);
    
    const modal = document.getElementById('editModal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  
  async function loadData() {
    await loadVocabulary();
    await loadExcludeWords();
  }
  
  async function loadVocabulary() {
    try {
      const response = await sendMessage({ action: 'get-vocabulary' });
      if (response && response.success) {
        currentVocabulary = response.vocabulary;
        renderVocabulary();
      }
    } catch (error) {
      console.error('加载词库失败:', error);
    }
  }
  
  async function loadExcludeWords() {
    try {
      const response = await sendMessage({ action: 'get-exclude-words' });
      if (response && response.success) {
        currentExcludeWords = response.words;
        renderExcludeWords();
      }
    } catch (error) {
      console.error('加载不翻译列表失败:', error);
    }
  }
  
  function showSection(section) {
    const vocabularySection = document.getElementById('vocabularySection');
    const excludeSection = document.getElementById('excludeSection');
    
    if (section === 'vocabulary') {
      vocabularySection.style.display = 'block';
      excludeSection.style.display = 'none';
    } else {
      vocabularySection.style.display = 'none';
      excludeSection.style.display = 'block';
    }
  }
  
  function renderVocabulary() {
    const list = document.getElementById('vocabularyList');
    const empty = document.getElementById('vocabularyEmpty');
    
    if (currentVocabulary.length === 0) {
      empty.style.display = 'block';
      list.innerHTML = '';
      list.appendChild(empty);
      return;
    }
    
    empty.style.display = 'none';
    
    list.innerHTML = currentVocabulary.map(item => `
      <div class="vocabulary-item" data-id="${item.id}">
        <div class="vocabulary-item-main">
          <div class="vocabulary-word-row">
            <span class="vocabulary-word">${escapeHtml(item.word)}</span>
            <span class="vocabulary-lang">${item.from === 'zh' ? '中→英' : '英→中'}</span>
          </div>
          <div class="vocabulary-translation">${escapeHtml(item.translation)}</div>
          ${item.notes ? `<div class="vocabulary-notes">${escapeHtml(item.notes)}</div>` : ''}
        </div>
        <div class="vocabulary-item-actions">
          <button class="action-icon-btn edit" title="编辑笔记" data-id="${item.id}">✏️</button>
          <button class="action-icon-btn delete" title="删除" data-id="${item.id}">🗑️</button>
        </div>
      </div>
    `).join('');
    
    list.querySelectorAll('.action-icon-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openEditModal(id);
      });
    });
    
    list.querySelectorAll('.action-icon-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('确定要删除这个单词吗？')) {
          await deleteVocabularyItem(id);
        }
      });
    });
  }
  
  function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (!searchTerm) {
      renderVocabulary();
      return;
    }
    
    const filtered = currentVocabulary.filter(item => 
      item.word.toLowerCase().includes(searchTerm) ||
      item.translation.toLowerCase().includes(searchTerm) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm))
    );
    
    renderFilteredVocabulary(filtered);
  }
  
  function renderFilteredVocabulary(filtered) {
    const list = document.getElementById('vocabularyList');
    const empty = document.getElementById('vocabularyEmpty');
    
    if (filtered.length === 0) {
      empty.style.display = 'block';
      empty.innerHTML = `
        <div class="empty-icon">🔍</div>
        <p>未找到匹配的词汇</p>
      `;
      list.innerHTML = '';
      list.appendChild(empty);
      return;
    }
    
    empty.style.display = 'none';
    
    list.innerHTML = filtered.map(item => `
      <div class="vocabulary-item" data-id="${item.id}">
        <div class="vocabulary-item-main">
          <div class="vocabulary-word-row">
            <span class="vocabulary-word">${escapeHtml(item.word)}</span>
            <span class="vocabulary-lang">${item.from === 'zh' ? '中→英' : '英→中'}</span>
          </div>
          <div class="vocabulary-translation">${escapeHtml(item.translation)}</div>
          ${item.notes ? `<div class="vocabulary-notes">${escapeHtml(item.notes)}</div>` : ''}
        </div>
        <div class="vocabulary-item-actions">
          <button class="action-icon-btn edit" title="编辑笔记" data-id="${item.id}">✏️</button>
          <button class="action-icon-btn delete" title="删除" data-id="${item.id}">🗑️</button>
        </div>
      </div>
    `).join('');
    
    list.querySelectorAll('.action-icon-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openEditModal(id);
      });
    });
    
    list.querySelectorAll('.action-icon-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('确定要删除这个单词吗？')) {
          await deleteVocabularyItem(id);
        }
      });
    });
  }
  
  function handleExport() {
    if (currentVocabulary.length === 0) {
      showToast('词库为空，无法导出', 'error');
      return;
    }
    
    const exportData = currentVocabulary.map(item => ({
      单词: item.word,
      翻译: item.translation,
      语言方向: item.from === 'zh' ? '中文→英文' : '英文→中文',
      笔记: item.notes || '',
      添加时间: new Date(item.createdAt).toLocaleString()
    }));
    
    let csvContent = '单词,翻译,语言方向,笔记,添加时间\n';
    exportData.forEach(row => {
      csvContent += `"${escapeCsv(row.单词)}","${escapeCsv(row.翻译)}","${row.语言方向}","${escapeCsv(row.笔记)}","${row.添加时间}"\n`;
    });
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `翻译词库_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('导出成功');
  }
  
  function escapeCsv(str) {
    if (!str) return '';
    return str.replace(/"/g, '""');
  }
  
  async function handleClearAll() {
    if (currentVocabulary.length === 0) {
      showToast('词库已经是空的', 'error');
      return;
    }
    
    if (confirm(`确定要清空所有 ${currentVocabulary.length} 个单词吗？此操作不可恢复。`)) {
      try {
        for (const item of currentVocabulary) {
          await sendMessage({ action: 'remove-vocabulary-item', id: item.id });
        }
        currentVocabulary = [];
        renderVocabulary();
        showToast('词库已清空');
      } catch (error) {
        showToast('清空失败', 'error');
        console.error('清空词库失败:', error);
      }
    }
  }
  
  async function deleteVocabularyItem(id) {
    try {
      const response = await sendMessage({ action: 'remove-vocabulary-item', id });
      if (response && response.success) {
        currentVocabulary = currentVocabulary.filter(item => item.id !== id);
        renderVocabulary();
        showToast('已删除');
      }
    } catch (error) {
      showToast('删除失败', 'error');
      console.error('删除失败:', error);
    }
  }
  
  function openEditModal(id) {
    const item = currentVocabulary.find(i => i.id === id);
    if (!item) return;
    
    editingId = id;
    
    document.getElementById('modalWord').textContent = item.word;
    document.getElementById('modalTranslation').textContent = item.translation;
    document.getElementById('modalNotes').value = item.notes || '';
    
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex';
  }
  
  function closeModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
    editingId = null;
  }
  
  async function handleSaveNotes() {
    if (!editingId) return;
    
    const notes = document.getElementById('modalNotes').value.trim();
    
    try {
      const response = await sendMessage({ 
        action: 'update-vocabulary-notes', 
        id: editingId, 
        notes 
      });
      
      if (response && response.success) {
        const item = currentVocabulary.find(i => i.id === editingId);
        if (item) {
          item.notes = notes;
          item.updatedAt = Date.now();
        }
        renderVocabulary();
        closeModal();
        showToast('保存成功');
      }
    } catch (error) {
      showToast('保存失败', 'error');
      console.error('保存笔记失败:', error);
    }
  }
  
  function renderExcludeWords() {
    const list = document.getElementById('excludeList');
    const empty = document.getElementById('excludeEmpty');
    
    if (currentExcludeWords.length === 0) {
      empty.style.display = 'block';
      list.innerHTML = '';
      list.appendChild(empty);
      return;
    }
    
    empty.style.display = 'none';
    
    list.innerHTML = currentExcludeWords.map(word => `
      <div class="exclude-item">
        <span class="exclude-word">${escapeHtml(word)}</span>
        <button class="btn-danger" style="padding: 4px 12px; font-size: 12px;" data-word="${word}">移除</button>
      </div>
    `).join('');
    
    list.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const word = btn.dataset.word;
        await removeExcludeWord(word);
      });
    });
  }
  
  async function handleAddExclude() {
    const input = document.getElementById('newExcludeInput');
    const word = input.value.trim();
    
    if (!word) {
      showToast('请输入单词', 'error');
      return;
    }
    
    if (currentExcludeWords.includes(word.toLowerCase())) {
      showToast('该单词已存在', 'error');
      return;
    }
    
    try {
      const response = await sendMessage({ action: 'add-exclude-word', word });
      if (response && response.success) {
        currentExcludeWords.push(word.toLowerCase());
        input.value = '';
        renderExcludeWords();
        showToast('添加成功');
      }
    } catch (error) {
      showToast('添加失败', 'error');
      console.error('添加失败:', error);
    }
  }
  
  async function removeExcludeWord(word) {
    try {
      const response = await sendMessage({ action: 'remove-exclude-word', word });
      if (response && response.success) {
        currentExcludeWords = currentExcludeWords.filter(w => w !== word.toLowerCase());
        renderExcludeWords();
        showToast('已移除');
      }
    } catch (error) {
      showToast('移除失败', 'error');
      console.error('移除失败:', error);
    }
  }
  
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
})();