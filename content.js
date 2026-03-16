// Gemini Chat Folders - content.js
(function () {
  'use strict';

  // ─── STATE ──────────────────────────────────────────────────────────────────

  let state = {
    folders: [],         // [{ id, name, color, parentId, expanded, chatIds, createdAt, updatedAt }]
    chats: {},           // { chatId: { title, url } }
    deletedFolders: [],  // [{ id, deletedAt }] – tombstones for merge
    foldersVisible: false,
    searchQuery: '',
    unassignedQuery: '',
    unassignedSearchOpen: false,
    lastModified: 0,
  };

  // ─── STORAGE ─────────────────────────────────────────────────────────────────

  function persistLocal() {
    chrome.storage.local.set({
      gcf_folders:         state.folders,
      gcf_chats:           state.chats,
      gcf_deleted_folders: state.deletedFolders,
      gcf_lastModified:    state.lastModified,
    });
  }

  function saveState() {
    state.lastModified = Date.now();
    persistLocal();
    schedulePush();
  }

  function loadState(callback) {
    chrome.storage.local.get(['gcf_folders', 'gcf_chats', 'gcf_deleted_folders', 'gcf_lastModified'], (result) => {
      if (result.gcf_folders)         state.folders        = result.gcf_folders;
      if (result.gcf_chats)           state.chats          = result.gcf_chats;
      if (result.gcf_deleted_folders) state.deletedFolders = result.gcf_deleted_folders;
      state.lastModified = result.gcf_lastModified || 0;
      callback && callback();
    });
  }

  // ─── FOLDER CRUD ─────────────────────────────────────────────────────────────

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function createFolder(name, parentId = null, color = '#4285f4') {
    const now = Date.now();
    const folder = { id: uid(), name, parentId, color, expanded: true, chatIds: [], createdAt: now, updatedAt: now };
    state.folders.push(folder);
    saveState();
    return folder;
  }

  function deleteFolder(folderId) {
    const now = Date.now();
    state.folders.filter(f => f.parentId === folderId).forEach(f => deleteFolder(f.id));
    state.folders = state.folders.filter(f => f.id !== folderId);
    state.deletedFolders.push({ id: folderId, deletedAt: now });
    saveState();
  }

  function renameFolder(folderId, name) {
    const f = state.folders.find(f => f.id === folderId);
    if (f) { f.name = name; f.updatedAt = Date.now(); saveState(); }
  }

  function setFolderColor(folderId, color) {
    const f = state.folders.find(f => f.id === folderId);
    if (f) { f.color = color; f.updatedAt = Date.now(); saveState(); }
  }

  function toggleFolderExpanded(folderId) {
    const f = state.folders.find(f => f.id === folderId);
    if (f) { f.expanded = !f.expanded; saveState(); }
  }

  function addChatToFolder(folderId, chatId, title, url) {
    const f = state.folders.find(f => f.id === folderId);
    if (!f) return;
    if (!f.chatIds.includes(chatId)) f.chatIds.push(chatId);
    f.updatedAt = Date.now();
    state.chats[chatId] = { title, url };
    saveState();
  }

  function removeChatFromFolder(folderId, chatId) {
    const f = state.folders.find(f => f.id === folderId);
    if (f) { f.chatIds = f.chatIds.filter(id => id !== chatId); f.updatedAt = Date.now(); saveState(); }
  }

  function moveChatBetweenFolders(fromId, toId, chatId) {
    if (fromId) removeChatFromFolder(fromId, chatId);
    const chat = state.chats[chatId];
    if (toId && chat) addChatToFolder(toId, chatId, chat.title, chat.url);
  }

  // ─── SIDEBAR SCRAPING ────────────────────────────────────────────────────────

  // Gemini's .conversation-title has an Angular comment node (<!--->) as first child,
  // followed by the actual text node, then a .conversation-title-cover div.
  // We must iterate childNodes and collect TEXT_NODE types only.
  function extractTitleText(titleEl, fallbackEl) {
    if (!titleEl) return fallbackEl?.textContent?.trim() || '(Untitled)';
    let text = '';
    titleEl.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    });
    return text.trim() || fallbackEl?.textContent?.trim() || '(Untitled)';
  }

  function scrapeChats() {
    const items = [];
    document.querySelectorAll('a[data-test-id="conversation"]').forEach(link => {
      // Handle both /gem/workspace/chatId and /app/chatId URL patterns
      let m = link.href.match(/\/gem\/[a-f0-9]+\/([a-f0-9]+)/);
      if (!m) m = link.href.match(/\/app\/([a-f0-9]+)/);
      if (!m) return;
      const titleEl = link.querySelector('.conversation-title');
      const title = extractTitleText(titleEl, link);
      items.push({ id: m[1], title, url: link.href });
    });
    return items;
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name) {
    const icons = {
      folder:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
      chat:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      chevron:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
      plus:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      dots:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
      search:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      close:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      edit:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      trash:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
      folders:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      refresh:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    };
    return `<span class="gcf-icon">${icons[name] || ''}</span>`;
  }

  // Build a chat URL that preserves the /u/N/ user prefix from the current page.
  // Uses /gem/ format for Gemini URLs.
  function chatUrl(chatId) {
    const m = window.location.pathname.match(/^(\/u\/\d+)\//);
    const prefix = m ? m[1] : '';
    return `https://gemini.google.com${prefix}/gem/${chatId}`;
  }

  // Inject the /u/N/ prefix into a stored URL if the current session has one
  // and the stored URL doesn't already include it.
  function resolveUrl(url) {
    if (!url) return url;
    const m = window.location.pathname.match(/^(\/u\/\d+)\//);
    if (!m) return url;
    const prefix = m[1]; // e.g. "/u/1"
    if (url.includes(prefix + '/')) return url;
    return url.replace('https://gemini.google.com/', `https://gemini.google.com${prefix}/`);
  }

  // Get the current chat ID from the window URL
  function getCurrentChatId() {
    // /gem/workspace/chatId pattern
    let m = window.location.pathname.match(/\/gem\/[a-f0-9]+\/([a-f0-9]+)/);
    if (!m) m = window.location.pathname.match(/\/app\/([a-f0-9]+)/);
    return m ? m[1] : null;
  }

  // ─── DOM REFS ─────────────────────────────────────────────────────────────────

  let foldersBtn = null;
  let foldersPanel = null;
  let overlayContainer = null;
  let lastPullTime = 0;

  // ─── DRIVE SYNC STATE ────────────────────────────────────────────────────────

  const DRIVE_FILE_NAME = 'gemini-chat-folders.json';
  const DRIVE_API       = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD    = 'https://www.googleapis.com/upload/drive/v3';

  let driveFileId = null;   // cached Drive file ID once found/created
  let syncTimeout = null;   // debounce handle for pushToDrive
  let syncStatus  = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'

  // ─── INJECTION ────────────────────────────────────────────────────────────────

  function injectFoldersButton() {
    if (document.getElementById('gcf-btn')) return;

    const newChatButton = document.querySelector('side-nav-action-button[data-test-id="new-chat-button"]');
    if (!newChatButton) return;

    const tempChatButton = newChatButton.querySelector('temp-chat-button');
    if (!tempChatButton) return;

    foldersBtn = document.createElement('button');
    foldersBtn.id = 'gcf-btn';
    foldersBtn.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base gcf-folders-button mat-unthemed';
    foldersBtn.setAttribute('aria-label', 'Chat Folders');
    foldersBtn.setAttribute('title', 'Chat Folders');
    foldersBtn.innerHTML = `
      <span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
      ${icon('folders')}
      <span class="mat-focus-indicator"></span>
      <span class="mat-mdc-button-touch-target"></span>
      <span class="mat-ripple mat-mdc-button-ripple"></span>`;

    newChatButton.insertBefore(foldersBtn, tempChatButton);
    foldersBtn.addEventListener('click', togglePanel);
  }

  function togglePanel() {
    state.foldersVisible = !state.foldersVisible;
    document.getElementById('gcf-btn')?.classList.toggle('active', state.foldersVisible);

    if (state.foldersVisible) {
      showPanel();
    } else {
      hidePanel();
    }
  }

  function showPanel() {
    // Create overlay container if it doesn't exist
    if (!overlayContainer) {
      overlayContainer = document.createElement('div');
      overlayContainer.id = 'gcf-overlay';
      overlayContainer.innerHTML = '<div id="gcf-backdrop"></div>';
      document.body.appendChild(overlayContainer);

      // Close on backdrop click
      overlayContainer.querySelector('#gcf-backdrop').addEventListener('click', togglePanel);
    }

    // Create panel if it doesn't exist
    if (!foldersPanel) {
      foldersPanel = document.createElement('div');
      foldersPanel.id = 'gcf-panel';
      overlayContainer.appendChild(foldersPanel);
    }

    applyTheme();
    overlayContainer.style.display = 'flex';
    render();
    enableNativeDrag();
    if (Date.now() - lastPullTime > 60_000) pullFromDrive();
  }

  // ─── THEME DETECTION ─────────────────────────────────────────────────────────

  function detectTheme() {
    // Try several sidebar elements until we find one with a non-transparent background
    const probes = [
      'bard-sidenav',
      'side-navigation-content',
      '.sidenav-style-updates',
      '.chat-history-list',
      'side-nav-action-button a',
    ];
    for (const sel of probes) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) continue;
      const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (alpha < 0.05) continue; // skip transparent
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      return lum > 0.5 ? 'light' : 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme() {
    const theme = detectTheme();
    const isDark = theme === 'dark';
    foldersPanel?.classList.toggle('gcf-dark', isDark);
    foldersPanel?.classList.toggle('gcf-light', !isDark);
    document.getElementById('gcf-btn')?.classList.toggle('gcf-dark', isDark);
    document.getElementById('gcf-btn')?.classList.toggle('gcf-light', !isDark);
  }

  // Theme detection moved below


  function hidePanel() {
    if (overlayContainer) overlayContainer.style.display = 'none';
    removeNativeDrag();
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  //
  // Render is split into two levels:
  //   buildPanelStructure() – creates header + tree skeleton ONCE so the search
  //                           input is never destroyed (which would lose focus).
  //   updateTree()          – replaces only #gcf-tree on every state change.
  //
  // Public entry point is always render(); callers never need to know which path runs.

  function render() {
    if (!foldersPanel || !state.foldersVisible) return;
    applyTheme();
    if (!foldersPanel.querySelector('.gcf-header')) {
      buildPanelStructure();
    } else {
      updateTree();
    }
  }

  function buildPanelStructure() {
    foldersPanel.innerHTML = `
      <div class="gcf-header">
        <div class="gcf-search-wrap">
          ${icon('search')}
          <input id="gcf-search" class="gcf-search" type="text"
                 placeholder="Search folders &amp; chats…"
                 value="${esc(state.searchQuery)}" autocomplete="off" />
        </div>
        <button class="gcf-add-root" title="New folder">${icon('plus')}</button>
        <button id="gcf-refresh-btn" class="gcf-refresh-btn" title="Refresh chat list">
          <span class="gcf-icon">${icon('refresh')}</span>
        </button>
        <button id="gcf-sync-btn" class="gcf-sync-btn gcf-sync-${syncStatus}" title="${syncStatus === 'idle' ? 'Connect Google Drive' : 'Google Drive Sync'}">
          <span class="gcf-icon gcf-sync-icon">${syncIconSVG(syncStatus)}</span>
        </button>
      </div>
      <div id="gcf-tree" class="gcf-tree"></div>`;

    bindHeaderEvents();
    updateTree();
  }

  function bindHeaderEvents() {
    const input = foldersPanel.querySelector('#gcf-search');
    input?.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      syncClearBtn();
      updateTree();
    });
    foldersPanel.querySelector('.gcf-add-root')?.addEventListener('click', () => promptFolder(null));
    foldersPanel.querySelector('#gcf-refresh-btn')?.addEventListener('click', () => {
      updateTree();
    });
    foldersPanel.querySelector('#gcf-sync-btn')?.addEventListener('click', async () => {
      if (syncStatus === 'idle' || syncStatus === 'error') {
        // Need interactive auth
        updateSyncStatus('syncing');
        try {
          await getDriveToken(true);
          driveFileId = null;
          await pullFromDrive();
        } catch (e) {
          updateSyncStatus('error');
        }
      } else {
        // Already connected – pull (which merges then pushes merged result)
        await pullFromDrive();
      }
    });
  }

  // Add/remove the × clear button without touching the input element
  function syncClearBtn() {
    const wrap = foldersPanel.querySelector('.gcf-search-wrap');
    if (!wrap) return;
    let btn = wrap.querySelector('.gcf-search-clear');
    if (state.searchQuery && !btn) {
      btn = document.createElement('button');
      btn.className = 'gcf-search-clear';
      btn.title = 'Clear';
      btn.innerHTML = icon('close');
      btn.addEventListener('click', () => {
        state.searchQuery = '';
        const inp = foldersPanel.querySelector('#gcf-search');
        if (inp) { inp.value = ''; inp.focus(); }
        syncClearBtn();
        updateTree();
      });
      wrap.appendChild(btn);
    } else if (!state.searchQuery && btn) {
      btn.remove();
    }
  }

  function updateTree() {
    const treeEl = foldersPanel.querySelector('#gcf-tree');
    if (!treeEl) return;
    const available = scrapeChats();
    const q = state.searchQuery.toLowerCase();
    const currentChatId = getCurrentChatId();
    treeEl.innerHTML = buildTreeHTML(available, q, currentChatId);
    bindTreeEvents(available);
  }

  // Only replaces the chat list inside the unassigned section —
  // the search input DOM node is preserved so focus is not lost.
  function updateUnassignedList() {
    const listEl = foldersPanel.querySelector('#gcf-unassigned-list');
    const countEl = foldersPanel.querySelector('#gcf-unassigned-section .gcf-section-label .gcf-count');
    if (!listEl) return;

    const available = scrapeChats();
    const assignedIds = new Set(state.folders.flatMap(f => f.chatIds));
    const unassigned = available.filter(c => !assignedIds.has(c.id));
    const uq = state.unassignedQuery.toLowerCase();
    const visible = uq ? unassigned.filter(c => c.title.toLowerCase().includes(uq)) : unassigned;
    const currentChatId = getCurrentChatId();

    listEl.innerHTML = visible.map(c => renderChatItem(c, null, 1, currentChatId)).join('') +
      (uq && visible.length === 0 ? `<div class="gcf-empty-inline">No matches</div>` : '');

    if (countEl) {
      countEl.textContent = uq ? `${visible.length}/${unassigned.length}` : String(unassigned.length);
    }

    // Re-bind chat click events on the new items
    listEl.querySelectorAll('.gcf-chat').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.gcf-remove-chat')) return;
        window.location.href = resolveUrl(item.dataset.url) || chatUrl(item.dataset.chatId);
      });
    });
    // Re-bind drag on new items
    bindDragDrop(available);
  }

  function buildTreeHTML(available, q, currentChatId) {
    const roots = state.folders.filter(f => !f.parentId);
    const matched = q ? filterFolders(roots, q) : roots;

    const assignedIds = new Set(state.folders.flatMap(f => f.chatIds));
    const unassigned = available.filter(c => !assignedIds.has(c.id));

    let html = '';

    if (matched.length === 0 && !q) {
      html += `<div class="gcf-empty">
        ${icon('folder')}
        <p>No folders yet</p>
        <span>Click + to create your first folder</span>
      </div>`;
    }

    if (q && matched.length === 0) {
      html += `<div class="gcf-empty"><p>No matching folders for "${esc(state.searchQuery)}"</p></div>`;
    }

    matched.forEach(f => { html += renderFolder(f, 0, available, q, currentChatId); });

    if (unassigned.length > 0) {
      const uq = state.unassignedQuery.toLowerCase();
      const visibleUnassigned = uq
        ? unassigned.filter(c => c.title.toLowerCase().includes(uq))
        : unassigned;

      html += `<div class="gcf-section" id="gcf-unassigned-section">
        <div class="gcf-section-label">
          <span>Unassigned</span>
          <span class="gcf-count">${uq ? visibleUnassigned.length + '/' + unassigned.length : unassigned.length}</span>
          <button class="gcf-action gcf-unassigned-search-btn ${state.unassignedSearchOpen ? 'active' : ''}"
                  title="${state.unassignedSearchOpen ? 'Close search' : 'Search unassigned'}">${icon('search')}</button>
        </div>
        ${state.unassignedSearchOpen ? `
        <div class="gcf-unassigned-search-wrap">
          <input id="gcf-unassigned-search" class="gcf-unassigned-search"
                 type="text" placeholder="Search unassigned…"
                 value="${esc(state.unassignedQuery)}" autocomplete="off" />
          ${state.unassignedQuery ? `<button class="gcf-unassigned-clear" title="Clear">${icon('close')}</button>` : ''}
        </div>` : ''}
        <div id="gcf-unassigned-list" class="gcf-drop-zone" data-folder-id="">
          ${visibleUnassigned.map(c => renderChatItem(c, null, 1, currentChatId)).join('')}
          ${uq && visibleUnassigned.length === 0 ? `<div class="gcf-empty-inline">No matches</div>` : ''}
        </div>
      </div>`;
    }

    return html;
  }

  function renderFolder(folder, depth, available, q, currentChatId) {
    const children = state.folders.filter(f => f.parentId === folder.id);
    const chats = folder.chatIds.map(id => {
      const live = available.find(c => c.id === id);
      return live || state.chats[id] ? { id, ...(live || state.chats[id]) } : null;
    }).filter(Boolean);

    const fq = chats.filter(c => !q || c.title?.toLowerCase().includes(q));
    const fc = q ? filterFolders(children, q) : children;
    const isExpanded = folder.expanded || (q && (fq.length > 0 || fc.length > 0));
    const indent = depth * 14;

    return `
      <div class="gcf-folder" data-folder-id="${folder.id}" data-depth="${depth}">
        <div class="gcf-folder-row" data-folder-id="${folder.id}" style="padding-left:${12 + indent}px">
          <button class="gcf-chevron ${isExpanded ? 'open' : ''}" data-fold="${folder.id}">${icon('chevron')}</button>
          <span class="gcf-folder-color-dot" style="background:${folder.color}"></span>
          <span class="gcf-folder-name">${esc(folder.name)}</span>
          <span class="gcf-count">${folder.chatIds.length}</span>
          <div class="gcf-folder-actions">
            <button class="gcf-action gcf-sub-btn" data-folder-id="${folder.id}" title="Add subfolder">${icon('plus')}</button>
            <button class="gcf-action gcf-menu-btn" data-folder-id="${folder.id}" title="Options">${icon('dots')}</button>
          </div>
        </div>
        <div class="gcf-folder-body ${isExpanded ? 'open' : ''}" data-folder-id="${folder.id}">
          <div class="gcf-drop-zone" data-folder-id="${folder.id}">
            ${fq.map(c => renderChatItem(c, folder.id, depth + 1, currentChatId)).join('')}
          </div>
          ${fc.map(child => renderFolder(child, depth + 1, available, q, currentChatId)).join('')}
        </div>
      </div>`;
  }

  function renderChatItem(chat, folderId, depth, currentChatId) {
    const indent = depth * 14;
    const isActive = chat.id === currentChatId;
    return `
      <div class="gcf-chat ${isActive ? 'gcf-chat-active' : ''}" data-chat-id="${chat.id}" data-url="${esc(chat.url || '')}" data-folder-id="${folderId || ''}"
           draggable="true" style="padding-left:${10 + indent}px" title="${esc(chat.title)}">
        ${icon('chat')}
        <span class="gcf-chat-title">${esc(chat.title)}</span>
        ${folderId ? `<button class="gcf-remove-chat" data-chat-id="${chat.id}" data-folder-id="${folderId}" title="Remove">${icon('close')}</button>` : ''}
      </div>`;
  }

  function filterFolders(folders, q) {
    return folders.filter(f => {
      if (f.name.toLowerCase().includes(q)) return true;
      if (f.chatIds.some(id => state.chats[id]?.title?.toLowerCase().includes(q))) return true;
      const children = state.folders.filter(c => c.parentId === f.id);
      return filterFolders(children, q).length > 0;
    });
  }

  // ─── EVENT BINDING ───────────────────────────────────────────────────────────
  // Only binds tree-level events. Header events (search, add-root) are bound once
  // in bindHeaderEvents() and persist across tree re-renders.

  function bindTreeEvents(available) {
    const tree = foldersPanel.querySelector('#gcf-tree');
    if (!tree) return;

    // Chevron toggles
    tree.querySelectorAll('.gcf-chevron').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFolderExpanded(btn.dataset.fold);
        render();
      });
    });

    // Folder row click (toggle)
    tree.querySelectorAll('.gcf-folder-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        toggleFolderExpanded(row.dataset.folderId);
        render();
      });
    });

    // Add subfolder
    tree.querySelectorAll('.gcf-sub-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); promptFolder(btn.dataset.folderId); });
    });

    // Folder menu
    tree.querySelectorAll('.gcf-menu-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); showFolderMenu(btn.dataset.folderId, btn); });
    });

    // Chat click – navigate
    tree.querySelectorAll('.gcf-chat').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.gcf-remove-chat')) return;
        window.location.href = resolveUrl(item.dataset.url) || chatUrl(item.dataset.chatId);
      });
    });

    // Remove chat from folder
    tree.querySelectorAll('.gcf-remove-chat').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeChatFromFolder(btn.dataset.folderId, btn.dataset.chatId);
        render();
      });
    });

    // Unassigned section – search toggle button
    tree.querySelector('.gcf-unassigned-search-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      state.unassignedSearchOpen = !state.unassignedSearchOpen;
      if (!state.unassignedSearchOpen) state.unassignedQuery = '';
      updateTree();
      // Auto-focus the newly created input
      if (state.unassignedSearchOpen) {
        setTimeout(() => foldersPanel.querySelector('#gcf-unassigned-search')?.focus(), 0);
      }
    });

    // Unassigned section – search input (uses targeted updater to keep focus)
    tree.querySelector('#gcf-unassigned-search')?.addEventListener('input', e => {
      state.unassignedQuery = e.target.value;
      updateUnassignedList();
    });

    // Unassigned section – clear button
    tree.querySelector('.gcf-unassigned-clear')?.addEventListener('click', () => {
      state.unassignedQuery = '';
      const inp = foldersPanel.querySelector('#gcf-unassigned-search');
      if (inp) { inp.value = ''; inp.focus(); }
      updateUnassignedList();
    });

    // Drag & drop within panel
    bindDragDrop(available);
  }

  // ─── DRAG & DROP ─────────────────────────────────────────────────────────────

  function enableNativeDrag() {
    document.querySelectorAll('a[data-test-id="conversation"]').forEach(link => {
      if (link.dataset.gcfDrag) return;
      link.dataset.gcfDrag = '1';
      link.setAttribute('draggable', 'true');

      link.addEventListener('dragstart', e => {
        const m = link.href.match(/\/app\/([a-f0-9]+)/);
        if (!m) return;
        const titleEl = link.querySelector('.conversation-title');
        const title = extractTitleText(titleEl, link);
        e.dataTransfer.setData('gcf/chat-id', m[1]);
        e.dataTransfer.setData('gcf/chat-title', title);
        e.dataTransfer.setData('gcf/chat-url', link.href);
        e.dataTransfer.effectAllowed = 'copy';
        document.body.classList.add('gcf-is-dragging');
      });

      link.addEventListener('dragend', () => {
        document.body.classList.remove('gcf-is-dragging');
        clearDropHighlights();
      });
    });
  }

  function removeNativeDrag() {
    document.querySelectorAll('a[data-test-id="conversation"][data-gcf-drag]').forEach(link => {
      link.removeAttribute('draggable');
      delete link.dataset.gcfDrag;
    });
  }

  function bindDragDrop(available) {
    if (!foldersPanel) return;

    // Make panel chat items draggable
    foldersPanel.querySelectorAll('.gcf-chat[draggable]').forEach(item => {
      item.addEventListener('dragstart', e => {
        const chatId = item.dataset.chatId;
        const chat = state.chats[chatId] || available.find(c => c.id === chatId);
        e.dataTransfer.setData('gcf/chat-id', chatId);
        e.dataTransfer.setData('gcf/chat-title', chat?.title || '');
        e.dataTransfer.setData('gcf/chat-url', chat?.url || '');
        if (item.dataset.folderId) e.dataTransfer.setData('gcf/src-folder', item.dataset.folderId);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('gcf-dragging');
        document.body.classList.add('gcf-is-dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('gcf-dragging');
        document.body.classList.remove('gcf-is-dragging');
        clearDropHighlights();
      });
    });

    // Drop zones: .gcf-drop-zone and .gcf-folder-row
    const zones = foldersPanel.querySelectorAll('.gcf-drop-zone, .gcf-folder-row');
    zones.forEach(zone => {
      zone.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('gcf/chat-id') && !e.dataTransfer.types.includes('gcf/folder-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('gcf-drop-over');
      });
      zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('gcf-drop-over');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('gcf-drop-over');

        const chatId = e.dataTransfer.getData('gcf/chat-id');
        const chatTitle = e.dataTransfer.getData('gcf/chat-title');
        const chatHref = e.dataTransfer.getData('gcf/chat-url');
        const srcFolder = e.dataTransfer.getData('gcf/src-folder') || null;
        const targetFolder = zone.dataset.folderId || null;

        if (chatId && targetFolder) {
          if (srcFolder !== targetFolder) moveChatBetweenFolders(srcFolder, targetFolder, chatId);
          if (!state.chats[chatId]) state.chats[chatId] = { title: chatTitle, url: chatHref };
          if (srcFolder === null) addChatToFolder(targetFolder, chatId, chatTitle, chatHref);
          render();
        }
      });
    });
  }

  function clearDropHighlights() {
    document.querySelectorAll('.gcf-drop-over').forEach(el => el.classList.remove('gcf-drop-over'));
  }

  // ─── FOLDER CONTEXT MENU ─────────────────────────────────────────────────────

  const COLORS = [
    { label: 'Blue',   v: '#4285f4' },
    { label: 'Red',    v: '#ea4335' },
    { label: 'Green',  v: '#34a853' },
    { label: 'Yellow', v: '#fbbc04' },
    { label: 'Purple', v: '#9c27b0' },
    { label: 'Orange', v: '#ff6d00' },
    { label: 'Pink',   v: '#e91e63' },
    { label: 'Teal',   v: '#009688' },
    { label: 'Cyan',   v: '#0097a7' },
    { label: 'Indigo', v: '#3949ab' },
  ];

  function showFolderMenu(folderId, anchor) {
    closeMenu();
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;

    const menu = document.createElement('div');
    menu.id = 'gcf-menu';
    menu.className = 'gcf-menu ' + (detectTheme() === 'light' ? 'gcf-light' : 'gcf-dark');
    menu.innerHTML = `
      <div class="gcf-menu-item gcf-menu-rename" data-id="${folderId}">
        ${icon('edit')} Rename
      </div>
      <div class="gcf-menu-label">Color</div>
      <div class="gcf-color-grid">
        ${COLORS.map(c => `<button class="gcf-color-swatch ${folder.color === c.v ? 'active' : ''}"
          data-id="${folderId}" data-color="${c.v}" style="background:${c.v}" title="${c.label}"></button>`).join('')}
      </div>
      <div class="gcf-menu-sep"></div>
      <div class="gcf-menu-item gcf-menu-delete danger" data-id="${folderId}">
        ${icon('trash')} Delete
      </div>`;

    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    let x = rect.right + 6;
    let y = rect.top;
    if (x + 190 > window.innerWidth) x = rect.left - 196;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.querySelector('.gcf-menu-rename').addEventListener('click', () => {
      closeMenu(); promptRename(folderId);
    });
    menu.querySelectorAll('.gcf-color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        setFolderColor(btn.dataset.id, btn.dataset.color);
        closeMenu(); render();
      });
    });
    menu.querySelector('.gcf-menu-delete').addEventListener('click', () => {
      closeMenu();
      const hasChildren = state.folders.some(f => f.parentId === folderId);
      const msg = `Delete "${folder.name}"${hasChildren ? ' and all its subfolders' : ''}?`;
      if (confirm(msg)) { deleteFolder(folderId); render(); }
    });

    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  }

  function closeMenu() {
    document.getElementById('gcf-menu')?.remove();
  }

  // ─── MODALS ───────────────────────────────────────────────────────────────────

  function promptFolder(parentId) {
    showModal('New Folder', '', value => {
      if (value.trim()) { createFolder(value.trim(), parentId); render(); }
    });
  }

  function promptRename(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;
    showModal('Rename Folder', folder.name, value => {
      if (value.trim()) { renameFolder(folderId, value.trim()); render(); }
    }, 'Rename');
  }

  function showModal(title, defaultValue, onConfirm, confirmLabel = 'Create') {
    closeModal();
    const themeClass = detectTheme() === 'light' ? 'gcf-light' : 'gcf-dark';
    const overlay = document.createElement('div');
    overlay.id = 'gcf-modal';
    overlay.className = 'gcf-modal-overlay';
    overlay.innerHTML = `
      <div class="gcf-modal ${themeClass}">
        <div class="gcf-modal-title">${esc(title)}</div>
        <input class="gcf-modal-input" type="text" value="${esc(defaultValue)}" placeholder="Folder name…" />
        <div class="gcf-modal-footer">
          <button class="gcf-modal-btn secondary" id="gcf-modal-cancel">Cancel</button>
          <button class="gcf-modal-btn primary" id="gcf-modal-ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    input.focus();
    input.select();

    const confirm = () => { onConfirm(input.value); closeModal(); };
    overlay.querySelector('#gcf-modal-ok').addEventListener('click', confirm);
    overlay.querySelector('#gcf-modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') closeModal();
    });
  }

  function closeModal() {
    document.getElementById('gcf-modal')?.remove();
  }

  // ─── DRIVE SYNC ───────────────────────────────────────────────────────────────

  function getDriveToken(interactive) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getAuthToken', interactive }, response => {
        if (chrome.runtime.lastError || response?.error) {
          reject(new Error(response?.error || chrome.runtime.lastError?.message || 'No token'));
        } else if (response?.token) {
          resolve(response.token);
        } else {
          reject(new Error('No token'));
        }
      });
    });
  }

  async function findOrCreateDriveFile(token) {
    if (driveFileId) return driveFileId;

    const searchRes = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%22${DRIVE_FILE_NAME}%22&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      driveFileId = searchData.files[0].id;
      return driveFileId;
    }

    // Create new empty file in appDataFolder
    const metadata = { name: DRIVE_FILE_NAME, parents: ['appDataFolder'] };
    const emptyPayload = JSON.stringify({ version: 1, lastModified: 0, folders: [], chats: {} });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('media', new Blob([emptyPayload], { type: 'application/json' }));

    const createRes = await fetch(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    const created = await createRes.json();
    driveFileId = created.id;
    return driveFileId;
  }

  // Merges two states (local + drive) into one without data loss.
  // Rules:
  //   Folders  – union by ID; for the same ID, the higher updatedAt wins.
  //              Any ID present in either side's tombstone list is removed.
  //   Chats    – union; drive wins on key collision (metadata rarely changes).
  //   Tombstones – union; highest deletedAt kept per ID.
  function mergeStates(local, drive) {
    // Merge tombstone maps
    const deletedMap = new Map();
    [...(local.deletedFolders || []), ...(drive.deletedFolders || [])].forEach(d => {
      if (!deletedMap.has(d.id) || d.deletedAt > deletedMap.get(d.id)) {
        deletedMap.set(d.id, d.deletedAt);
      }
    });

    // Merge folders: union, skip tombstoned IDs, newer updatedAt wins
    const folderMap = new Map();
    [...(local.folders || []), ...(drive.folders || [])].forEach(f => {
      if (deletedMap.has(f.id)) return;
      const existing = folderMap.get(f.id);
      const fTime = f.updatedAt || f.createdAt || 0;
      const eTime = existing ? (existing.updatedAt || existing.createdAt || 0) : -1;
      if (fTime >= eTime) folderMap.set(f.id, f);
    });

    // Merge chats: union (drive wins on collision)
    const chats = { ...(local.chats || {}), ...(drive.chats || {}) };

    return {
      folders:        [...folderMap.values()],
      chats,
      deletedFolders: [...deletedMap.entries()].map(([id, deletedAt]) => ({ id, deletedAt })),
    };
  }

  function handleSyncError(e, label) {
    if (!e || e.message === 'No token' || e.message?.includes('not signed in')) {
      updateSyncStatus('idle');
    } else {
      updateSyncStatus('error');
      console.error(`[GCF] ${label} error:`, e);
    }
  }

  async function pullFromDrive() {
    lastPullTime = Date.now();
    updateSyncStatus('syncing');
    try {
      const token  = await getDriveToken(false);
      const fileId = await findOrCreateDriveFile(token);

      const res      = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      const driveData = await res.json();

      const merged = mergeStates(
        { folders: state.folders, chats: state.chats, deletedFolders: state.deletedFolders },
        driveData
      );

      state.folders        = merged.folders;
      state.chats          = merged.chats;
      state.deletedFolders = merged.deletedFolders;
      state.lastModified   = Date.now();

      persistLocal();

      if (state.foldersVisible) render();

      // Always push the merged result back so Drive stays consistent.
      // Cancel any pending debounced push first to avoid a redundant second write.
      clearTimeout(syncTimeout);
      await pushToDrive();
    } catch (e) {
      handleSyncError(e, 'Drive pull');
    }
  }

  async function pushToDrive() {
    if (!state.lastModified) state.lastModified = Date.now();
    updateSyncStatus('syncing');
    try {
      const token  = await getDriveToken(false);
      const fileId = await findOrCreateDriveFile(token);

      const payload = JSON.stringify({
        version: 1,
        lastModified: state.lastModified,
        folders: state.folders,
        chats: state.chats,
        deletedFolders: state.deletedFolders,
      });

      await fetch(
        `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: payload,
        }
      );
      updateSyncStatus('synced');
    } catch (e) {
      handleSyncError(e, 'Drive push');
    }
  }

  function schedulePush() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(pushToDrive, 2000);
  }

  function updateSyncStatus(status) {
    syncStatus = status;
    const btn    = document.getElementById('gcf-sync-btn');
    const iconEl = btn?.querySelector('.gcf-sync-icon');
    if (!btn) return;

    btn.className = `gcf-sync-btn gcf-sync-${status}`;
    const titles = {
      idle:    'Connect Google Drive',
      syncing: 'Syncing…',
      synced:  'Synced with Google Drive',
      error:   'Sync error – click to retry',
    };
    btn.title = titles[status] || 'Google Drive Sync';
    if (iconEl) iconEl.innerHTML = syncIconSVG(status);
  }

  function syncIconSVG(status) {
    if (status === 'syncing') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="gcf-spin"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    }
    if (status === 'synced') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    if (status === 'error') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
    // idle – cloud-upload icon meaning "connect"
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────────

  function init() {
    loadState(() => {
      injectFoldersButton();

      const observer = new MutationObserver(() => {
        if (!document.getElementById('gcf-btn')) injectFoldersButton();
        if (state.foldersVisible) enableNativeDrag();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Background alarm triggers a sync by writing to storage — react here
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.gcf_sync_requested) {
          pullFromDrive();
        }
      });
    });
  }

  function waitForSidebar() {
    if (document.querySelector('side-nav-action-button[data-test-id="new-chat-button"]')) {
      init();
    } else {
      setTimeout(waitForSidebar, 400);
    }
  }

  waitForSidebar();
})();
