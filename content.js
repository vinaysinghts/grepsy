// LogLens Core Engine - content.js

(async function () {
  // Prevent duplicate injection
  if (window.LOGLENS_INITIALIZED) return;
  window.LOGLENS_INITIALIZED = true;

  // Diagnostic Event Logging ring buffer (stores up to 200 triage events)
  const DIAG_LOGS = [];
  function diagLog(event, data = {}) {
    if (DIAG_LOGS.length >= 200) {
      DIAG_LOGS.shift();
    }
    DIAG_LOGS.push({ ts: new Date().toISOString(), event, data });
  }

  diagLog('init:start', { url: window.location.href, userAgent: navigator.userAgent });

  // 1. Severity Keywords
  const ERROR_TERMS = ['error', 'err', 'fatal', 'critical', 'fail', 'failed', 'exception', 'severe', 'emergency', 'alert', 'panic', 'abort', 'unhandled', 'uncaught', 'rejected', 'traceback'];
  const WARN_TERMS = ['warn', 'warning', 'deprecation', 'attention', 'notice'];

  // Highlight Colors for Multi-term Search (modern high-contrast palette)
  const HIGHLIGHT_COLORS = [
    'rgba(255, 107, 107, 0.85)', // Coral
    'rgba(254, 202, 87, 0.85)',  // Gold
    'rgba(78, 205, 196, 0.85)',  // Teal
    'rgba(255, 159, 243, 0.85)', // Pink
    'rgba(29, 209, 161, 0.85)',  // Mint
    'rgba(84, 160, 255, 0.85)',  // Sky Blue
    'rgba(255, 159, 67, 0.85)'   // Orange
  ];

  // 10 Vibrant Multi-Color Highlight Colors
  const MULTI_HIGHLIGHT_COLORS = [
    'rgba(255, 107, 107, 0.85)', // Coral Red
    'rgba(254, 202, 87, 0.85)',  // Gold Yellow
    'rgba(78, 205, 196, 0.85)',  // Teal
    'rgba(255, 159, 243, 0.85)', // Pink
    'rgba(29, 209, 161, 0.85)',  // Mint Green
    'rgba(84, 160, 255, 0.85)',  // Sky Blue
    'rgba(255, 159, 67, 0.85)',   // Orange
    'rgba(162, 155, 254, 0.85)',  // Lavender Purple
    'rgba(250, 177, 160, 0.85)',  // Rose
    'rgba(0, 184, 148, 0.85)'     // Emerald Green
  ];

  // Traceback and Exception regex constants
  const traceRegex = /^\s+at\s+[\w\.\$\<\>\[\]]+\([\w\.\:\s]*\)/i;
  const pythonTraceHeader = /^traceback\s+\(most\s+recent\s+call\s+last\)/i;
  const pythonTraceLine = /^\s+file\s+".+",\s+line\s+\d+,\s+in\s+/i;
  const causedByRegex = /^caused\s+by:/i;

  // 2. Load settings from storage
  let enabled = true;
  let forceVirtualScroll = false;
  let virtualScrollThreshold = 20000;
  let customErrorTerms = [];
  let customWarnTerms = [];
  let storedMultiHighlights = [];
  let storedFilterPresets = [];

  // Cached DOM element references in IIFE scope for access across functions
  let searchInput, presetTrigger, presetMenu, toggleFilterBtn, toggleCaseBtn, toggleRegexBtn;
  let badgeErrors, badgeWarnings, badgeBookmarks, copyMatchesBtn, toggleHighlightsBtn, toggleWrapBtn;
  let exportDiagBtn, restoreViewBtn, clearFiltersBtn, navTargetPrev, navTargetNext, navBookmarksPrev, navBookmarksNext;
  let highlightsModal, closeHighlightsBtn, viewer;
  try {
    const settings = await chrome.storage.local.get({
      enabled: true,
      forceVirtualScroll: false,
      virtualScrollThreshold: 20000,
      customErrorTerms: [],
      customWarnTerms: [],
      multiHighlights: [],
      filterPresets: []
    });
    enabled = settings.enabled;
    forceVirtualScroll = settings.forceVirtualScroll;
    virtualScrollThreshold = settings.virtualScrollThreshold || 20000;
    customErrorTerms = settings.customErrorTerms;
    customWarnTerms = settings.customWarnTerms;
    storedMultiHighlights = settings.multiHighlights || [];
    storedFilterPresets = settings.filterPresets || [];
    diagLog('settings:loaded', { forceVirtualScroll, virtualScrollThreshold, customErrors: customErrorTerms.length, customWarns: customWarnTerms.length, presets: storedFilterPresets.length });
  } catch (err) {
    console.warn("LogLens: Storage read failed, falling back to defaults.");
    diagLog('error:storage-read-failed', { error: err.message });
  }

  // Combine default and custom terms
  const activeErrorTerms = [...ERROR_TERMS, ...customErrorTerms];
  const activeWarnTerms = [...WARN_TERMS, ...customWarnTerms];

  // Matcher regexes (smart boundary mapping)
  let errorRegex = compileKeywordsRegex(activeErrorTerms);
  let warnRegex = compileKeywordsRegex(activeWarnTerms);

  // 3. Early Exit / Bailout validation
  const pathname = window.location.pathname.toLowerCase();
  const isLogExt = pathname.endsWith('.log');
  const isPlainText = document.contentType === 'text/plain';
  const forceActivate = window.LOGLENS_FORCE_ACTIVATE === true;

  if (!forceActivate) {
    if (!enabled || (!isLogExt && !isPlainText)) {
      window.LOGLENS_INITIALIZED = false;
      return;
    }
  }

  // Capture original body content to restore on close
  const originalBodyHTML = document.body.innerHTML;
  const originalBodyStyle = document.body.getAttribute('style') || '';

  // 4. Create parsing progress loader screen
  const loader = document.createElement('div');
  loader.id = 'loglens-loader';
  loader.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: #000000;
    color: #3b82f6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Outfit', -apple-system, sans-serif;
    z-index: 2147483647;
  `;
  loader.innerHTML = `
    <div style="font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; background: linear-gradient(135deg, #3b82f6 0%, #a855f7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 0.5px;">LogLens</div>
    <div style="font-size: 0.82rem; color: #718096; margin-bottom: 18px;" id="loglens-loader-status">Reading raw log files...</div>
    <div style="width: 180px; height: 3px; background: #1a202c; border-radius: 2px; overflow: hidden; position: relative;">
      <div id="loglens-loader-progress" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #a855f7); transition: width 0.1s ease;"></div>
    </div>
  `;
  document.body.appendChild(loader);

  // Get raw log contents
  const rawText = document.querySelector('pre')?.textContent || document.body.textContent || '';
  if (!rawText.trim()) {
    console.warn("LogLens: No text content found to format.");
    diagLog('error:no-raw-text');
    window.LOGLENS_INITIALIZED = false;
    loader.remove();
    return;
  }

  // 5. State Management
  const STATE = {
    allLines: [],
    displayList: [], // array of lines/gaps
    bookmarks: new Set(), // 1-based original line numbers
    matchedIndices: new Set(), // set of 0-based matching line indices
    expandedLines: new Set(), // set of 0-based expanded matching line indices
    lastNavigatedBookmark: -1,
    lastNavigatedTargetIndex: -1,
    lastProgrammaticTargetIndex: -1,
    lastProgrammaticBookmarkIndex: -1,
    activeNavigatedIndex: -1,
    isAutoScrolling: false,
    autoScrollTimeout: null,
    searchQuery: '',
    useRegex: true,
    caseSensitive: false,
    searchFilterEnabled: true,
    filterMode: 'all', // 'all' | 'errors' | 'warnings'
    isVirtual: false,
    LINE_HEIGHT: 22,
    OVERSCAN: 20,
    globalWrap: false,
    multiHighlights: storedMultiHighlights.length === 10
      ? storedMultiHighlights.map(h => h.pinned ? h : { text: '', pinned: false })
      : Array.from({ length: 10 }, () => ({ text: '', pinned: false })),
    filterPresets: storedFilterPresets,
    shadowRoot: null,
    scrollContainer: null,
    linesContainer: null,
    stats: {
      total: 0,
      errors: 0,
      warnings: 0,
      hasAnyJson: false
    }
  };

  const rawLines = rawText.split(/\r?\n/);
  // Remove last empty line if file ends in newline
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  STATE.stats.total = rawLines.length;
  STATE.allLines = new Array(rawLines.length);
  STATE.isVirtual = STATE.stats.total >= virtualScrollThreshold || forceVirtualScroll;

  const statusText = loader.querySelector('#loglens-loader-status');
  const progressBar = loader.querySelector('#loglens-loader-progress');

  let lineIndex = 0;
  const parseChunkSize = 8000; // Batch of 8K lines yields smooth UX repaint intervals

  function parseNextChunk() {
    const chunkEnd = Math.min(rawLines.length, lineIndex + parseChunkSize);
    statusText.textContent = `Analyzing: ${lineIndex.toLocaleString()} / ${rawLines.length.toLocaleString()} lines`;
    progressBar.style.width = `${Math.min(100, Math.floor((lineIndex / rawLines.length) * 100))}%`;

    for (; lineIndex < chunkEnd; lineIndex++) {
      const text = rawLines[lineIndex];
      const isStackTrace = traceRegex.test(text) || pythonTraceHeader.test(text) || pythonTraceLine.test(text) || causedByRegex.test(text);
      const isError = isStackTrace || errorRegex.test(text);
      const isWarning = !isError && warnRegex.test(text);

      // Check for JSON/bracket occurrences
      const hasJson = (text.indexOf('{') !== -1 && text.indexOf('}') !== -1) ||
        (text.indexOf('[') !== -1 && text.indexOf(']') !== -1) ||
        (text.indexOf('(') !== -1 && text.indexOf(')') !== -1);

      if (isError) STATE.stats.errors++;
      if (isWarning) STATE.stats.warnings++;
      if (hasJson) STATE.stats.hasAnyJson = true;

      STATE.allLines[lineIndex] = {
        text: text,
        originalIndex: lineIndex + 1,
        isError: isError,
        isWarning: isWarning,
        hasJson: hasJson
      };
    }

    if (lineIndex < rawLines.length) {
      setTimeout(parseNextChunk, 0);
    } else {
      diagLog('init:parse-complete', { total: STATE.stats.total, errors: STATE.stats.errors, warnings: STATE.stats.warnings, isVirtual: STATE.isVirtual });
      finishInitialization();
    }
  }

  // Start the chunked parsing process
  parseNextChunk();

  function finishInitialization() {
    // Remove the loader overlay
    loader.remove();

    // Clear document body & lock scroll variables
    document.documentElement.setAttribute('style', 'margin:0; padding:0; overflow:hidden !important; height:100% !important; width:100% !important;');
    document.body.innerHTML = '';
    document.body.setAttribute('style', 'margin:0; padding:0; overflow:hidden !important; height:100% !important; width:100% !important; background-color:#000000;');

    // Create Shadow Host & Attach Shadow DOM
    const host = document.createElement('div');
    host.id = 'loglens-host';
    document.body.appendChild(host);
    STATE.shadowRoot = host.attachShadow({ mode: 'open' });

    // 6. Build UI inside Shadow DOM
    viewer = document.createElement('div');
    viewer.id = 'loglens-viewer';
    viewer.innerHTML = `
      <!-- Floating Minimalist Taskbar -->
      <div id="loglens-taskbar">
        <div class="taskbar-left">
          <span class="logo">
            <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <defs>
                <linearGradient id="logo-icon-grad-shadow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#3b82f6"></stop>
                  <stop offset="100%" stop-color="#a855f7"></stop>
                </linearGradient>
              </defs>
              <circle cx="9" cy="9" r="6" stroke="url(#logo-icon-grad-shadow)"></circle>
              <path d="M14 14l5 5" stroke="url(#logo-icon-grad-shadow)"></path>
              <path d="M6.5 7.5h5" stroke="url(#logo-icon-grad-shadow)" stroke-width="1.5"></path>
              <path d="M6.5 10.5h5" stroke="url(#logo-icon-grad-shadow)" stroke-width="1.5"></path>
            </svg>
            <span class="logo-text">LogLens</span>
          </span>
          <span class="total-lines-text" id="loglens-lines-counter">Showing: ${STATE.stats.total.toLocaleString()} / ${STATE.stats.total.toLocaleString()}</span>
          <div class="search-wrapper">
            <input type="text" id="loglens-search" placeholder="Filter lines with regex or use | for multiple terms" />
            <div class="search-toggles">
              <button id="toggle-filter" class="toggle-btn active" title="Filter Matches (show matching lines only)">
                <svg class="toggle-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
              </button>
              <button id="toggle-case" class="toggle-btn" title="Match Case (aA)">aA</button>
              <button id="toggle-regex" class="toggle-btn active" title="Use Regular Expression (.*)">.*</button>
            </div>
          </div>
          <div class="preset-dropdown-wrapper">
            <button id="preset-trigger" class="taskbar-btn" title="Filter Presets">📋 Presets</button>
            <div id="preset-menu" class="preset-menu hidden"></div>
          </div>
          <button id="clear-filters-btn" class="taskbar-btn hidden" title="Clear Filters (Esc)">⎚ Clear</button>
          
          <!-- Match/Error Navigation Group -->
          <div id="nav-group-errors" class="nav-group nav-mode-error">
            <button id="nav-target-next" class="taskbar-btn nav-arrow" title="Next Match/Error (F8)">⤓</button>
            <button id="nav-target-prev" class="taskbar-btn nav-arrow" title="Previous Match/Error (Shift+F8)">⤒</button>
          </div>

          <!-- Bookmarks Navigation Group -->
          <div class="nav-group bookmarks-nav-group">
            <button id="nav-bookmarks-next" class="taskbar-btn nav-arrow" disabled title="Next Bookmark (F2)">⭐⤓</button>
            <button id="nav-bookmarks-prev" class="taskbar-btn nav-arrow" disabled title="Previous Bookmark (Shift+F2)">⭐⤒</button>
          </div>
        </div>
        
        <div class="taskbar-center">
          <button id="badge-errors" class="stat-badge errors" title="Toggle Error Filter">
            🔴 ${STATE.stats.errors}
          </button>
          <button id="badge-warnings" class="stat-badge warnings" title="Toggle Warning Filter">
            ⚠️ ${STATE.stats.warnings}
          </button>
          <button id="badge-bookmarks" class="stat-badge bookmarks" title="Toggle Bookmarks Filter">
            ⭐ 0
          </button>
        </div>

        <div class="taskbar-right">
          <button id="copy-matches-btn" class="taskbar-btn hidden" title="Copy Filtered Lines">⧉</button>
          <button id="toggle-highlights-btn" class="taskbar-btn" title="Multi-Color Highlights (Alt+H)">🖍️ Highlights</button>
          <button id="toggle-wrap-btn" class="taskbar-btn" title="Toggle Word Wrap (Alt+W)">↩</button>
          <button id="export-diag-btn" class="taskbar-btn" title="Export Diagnostics Logs for Triage">🪵</button>
          <button id="restore-view-btn" class="taskbar-btn close-btn" title="Close LogLens & Restore Raw View">✕</button>
        </div>
      </div>

      <!-- Scrollable Viewport -->
      <div id="loglens-viewport" class="${STATE.isVirtual ? '' : 'raw-layout'}">
        <div id="loglens-spacer"></div>
        <div id="loglens-lines"></div>
      </div>

      <!-- Multi-Color Highlights Modal Overlay -->
      <div id="highlights-modal" class="highlights-modal-overlay hidden">
        <div class="highlights-modal-content">
          <div class="modal-header">
            <span class="modal-title">🌈 Multi-Color Highlights</span>
            <button class="modal-close" id="close-highlights-btn">✕</button>
          </div>
          <div id="highlights-grid" class="highlights-grid">
            <!-- 10 rows generated dynamically -->
          </div>
        </div>
      </div>

      <!-- Toast Notifications Container -->
      <div id="loglens-toast-container" style="position:fixed; bottom:20px; right:20px; z-index:2147483647; display:flex; flex-direction:column; gap:10px;"></div>
    `;

    // Hide viewer element until style is loaded to prevent FOUC
    const hideStyle = document.createElement('style');
    hideStyle.textContent = '#loglens-viewer { display: none !important; }';
    STATE.shadowRoot.appendChild(hideStyle);

    // Inject Styles directly into Shadow DOM via style tag (bypasses CORS/CSP fetch constraints on file:/// URLs)
    const styleEl = document.createElement('style');

    chrome.runtime.sendMessage({ action: 'getCss' }, (response) => {
      if (response && response.success && response.css) {
        styleEl.textContent = response.css;
        diagLog('css:injected', { source: 'ipc' });
      } else {
        console.warn("LogLens: Failed to load extension CSS via IPC. Falling back to fetch.");
        fetch(chrome.runtime.getURL('content.css'))
          .then(r => r.text())
          .then(css => {
            styleEl.textContent = css;
            diagLog('css:injected', { source: 'fetch-fallback' });
          })
          .catch(err => {
            console.error("LogLens: Fallback fetch also failed.", err);
            diagLog('error:css-injection-failed', { error: err.message });
          });
      }
      // Remove FOUC blocker
      if (hideStyle.parentNode) hideStyle.remove();
    });

    STATE.shadowRoot.appendChild(styleEl);
    STATE.shadowRoot.appendChild(viewer);

    // Cache elements
    STATE.scrollContainer = STATE.shadowRoot.getElementById('loglens-viewport');
    STATE.linesContainer = STATE.shadowRoot.getElementById('loglens-lines');

    searchInput = STATE.shadowRoot.getElementById('loglens-search');
    presetTrigger = STATE.shadowRoot.getElementById('preset-trigger');
    presetMenu = STATE.shadowRoot.getElementById('preset-menu');
    toggleFilterBtn = STATE.shadowRoot.getElementById('toggle-filter');
    toggleCaseBtn = STATE.shadowRoot.getElementById('toggle-case');
    toggleRegexBtn = STATE.shadowRoot.getElementById('toggle-regex');
    badgeErrors = STATE.shadowRoot.getElementById('badge-errors');
    badgeWarnings = STATE.shadowRoot.getElementById('badge-warnings');
    badgeBookmarks = STATE.shadowRoot.getElementById('badge-bookmarks');
    copyMatchesBtn = STATE.shadowRoot.getElementById('copy-matches-btn');
    toggleHighlightsBtn = STATE.shadowRoot.getElementById('toggle-highlights-btn');
    toggleWrapBtn = STATE.shadowRoot.getElementById('toggle-wrap-btn');
    exportDiagBtn = STATE.shadowRoot.getElementById('export-diag-btn');
    restoreViewBtn = STATE.shadowRoot.getElementById('restore-view-btn');
    clearFiltersBtn = STATE.shadowRoot.getElementById('clear-filters-btn');

    navTargetPrev = STATE.shadowRoot.getElementById('nav-target-prev');
    navTargetNext = STATE.shadowRoot.getElementById('nav-target-next');
    navBookmarksPrev = STATE.shadowRoot.getElementById('nav-bookmarks-prev');
    navBookmarksNext = STATE.shadowRoot.getElementById('nav-bookmarks-next');

    highlightsModal = STATE.shadowRoot.getElementById('highlights-modal');
    closeHighlightsBtn = STATE.shadowRoot.getElementById('close-highlights-btn');

    function updatePresetDropdown() {
      if (!presetMenu) return;
      presetMenu.innerHTML = '';

      const defaultItem = document.createElement('div');
      defaultItem.className = 'preset-menu-item';
      defaultItem.dataset.value = '';

      const defaultSpan = document.createElement('span');
      defaultSpan.className = 'preset-item-name';
      defaultSpan.textContent = '-- No Preset --';

      defaultItem.appendChild(defaultSpan);
      presetMenu.appendChild(defaultItem);

      STATE.filterPresets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'preset-menu-item';
        item.dataset.value = preset.query;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-item-name';
        nameSpan.textContent = preset.name;

        const querySpan = document.createElement('span');
        querySpan.className = 'preset-item-query';

        // Pre-scan matched counts for each preset
        let count = 0;
        if (preset.query) {
          try {
            const tester = new RegExp(preset.query, STATE.caseSensitive ? 'i' : 'gi');
            for (let i = 0; i < STATE.allLines.length; i++) {
              if (tester.test(STATE.allLines[i].text)) {
                count++;
              }
            }
          } catch (e) {
            diagLog('error:preset-scan-regex-failed', { name: preset.name, query: preset.query, error: e.message });
          }
        }

        querySpan.textContent = `${preset.query} (${count.toLocaleString()} matches)`;

        item.appendChild(nameSpan);
        item.appendChild(querySpan);
        presetMenu.appendChild(item);
      });
    }

    // Initialize display list and built dynamic panels
    buildHighlightsPanel();
    updatePresetDropdown();
    computeDisplayList();
    render();
  }

  // Multi-Color Highlights Modal handlers
  toggleHighlightsBtn.addEventListener('click', () => {
    highlightsModal.classList.toggle('hidden');
  });

  closeHighlightsBtn.addEventListener('click', () => {
    highlightsModal.classList.add('hidden');
  });

  highlightsModal.addEventListener('click', (e) => {
    if (e.target === highlightsModal) {
      highlightsModal.classList.add('hidden');
    }
  });

  // 7. Event Listeners (Taskbar Controls)

  presetTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    presetMenu.classList.toggle('hidden');
  });

  window.addEventListener('click', () => {
    if (presetMenu) {
      presetMenu.classList.add('hidden');
    }
  });

  presetMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.preset-menu-item');
    if (!item) return;

    const val = item.dataset.value;
    STATE.searchQuery = val;
    searchInput.value = val;
    if (val) {
      const name = item.querySelector('.preset-item-name').textContent;
      presetTrigger.textContent = `📋 ${name}`;
      presetTrigger.classList.add('active');
      STATE.filterMode = 'all';
      badgeErrors.classList.remove('active');
      badgeWarnings.classList.remove('active');
      badgeBookmarks.classList.remove('active');
    } else {
      presetTrigger.textContent = '📋 Presets';
      presetTrigger.classList.remove('active');
    }
    computeDisplayList(true);
    render();
    presetMenu.classList.add('hidden');
  });

  // Search input debouncer
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    presetTrigger.textContent = '📋 Presets';
    presetTrigger.classList.remove('active');
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      STATE.searchQuery = searchInput.value;
      // If we query via text, override active error/warning severity quick filters
      if (STATE.searchQuery !== '') {
        STATE.filterMode = 'all';
        badgeErrors.classList.remove('active');
        badgeWarnings.classList.remove('active');
        badgeBookmarks.classList.remove('active');
      }
      computeDisplayList(true);
      render();
    }, 150);
  });

  toggleFilterBtn.addEventListener('click', () => {
    STATE.searchFilterEnabled = !STATE.searchFilterEnabled;
    toggleFilterBtn.classList.toggle('active', STATE.searchFilterEnabled);
    showToast(STATE.searchFilterEnabled ? "Filter Matches enabled (hiding non-matching lines)" : "Filter Matches disabled (showing all lines, highlighting only)");
    computeDisplayList(true);
    render();
  });

  toggleCaseBtn.addEventListener('click', () => {
    STATE.caseSensitive = !STATE.caseSensitive;
    toggleCaseBtn.classList.toggle('active', STATE.caseSensitive);
    if (STATE.searchQuery) {
      computeDisplayList(true);
      render();
    }
  });

  toggleRegexBtn.addEventListener('click', () => {
    STATE.useRegex = !STATE.useRegex;
    toggleRegexBtn.classList.toggle('active', STATE.useRegex);
    if (STATE.searchQuery) {
      computeDisplayList(true);
      render();
    }
  });

  clearFiltersBtn.addEventListener('click', () => {
    STATE.searchQuery = '';
    searchInput.value = '';
    presetTrigger.textContent = '📋 Presets';
    presetTrigger.classList.remove('active');
    STATE.filterMode = 'all';
    badgeErrors.classList.remove('active');
    badgeWarnings.classList.remove('active');
    badgeBookmarks.classList.remove('active');
    computeDisplayList(true);
    render();
  });

  // Interactive Severity & Bookmark Filters
  badgeErrors.addEventListener('click', () => {
    if (STATE.filterMode === 'errors') {
      STATE.filterMode = 'all';
      badgeErrors.classList.remove('active');
    } else {
      STATE.filterMode = 'errors';
      STATE.searchQuery = '';
      searchInput.value = '';
      presetTrigger.textContent = '📋 Presets';
      presetTrigger.classList.remove('active');
      badgeErrors.classList.add('active');
      badgeWarnings.classList.remove('active');
      badgeBookmarks.classList.remove('active');
    }
    computeDisplayList(true);
    render();
  });

  badgeWarnings.addEventListener('click', () => {
    if (STATE.filterMode === 'warnings') {
      STATE.filterMode = 'all';
      badgeWarnings.classList.remove('active');
    } else {
      STATE.filterMode = 'warnings';
      STATE.searchQuery = '';
      searchInput.value = '';
      presetTrigger.textContent = '📋 Presets';
      presetTrigger.classList.remove('active');
      badgeWarnings.classList.add('active');
      badgeErrors.classList.remove('active');
      badgeBookmarks.classList.remove('active');
    }
    computeDisplayList(true);
    render();
  });

  badgeBookmarks.addEventListener('click', () => {
    if (STATE.filterMode === 'bookmarks') {
      STATE.filterMode = 'all';
      badgeBookmarks.classList.remove('active');
    } else {
      STATE.filterMode = 'bookmarks';
      STATE.searchQuery = '';
      searchInput.value = '';
      presetTrigger.textContent = '📋 Presets';
      presetTrigger.classList.remove('active');
      badgeBookmarks.classList.add('active');
      badgeErrors.classList.remove('active');
      badgeWarnings.classList.remove('active');
    }
    computeDisplayList(true);
    render();
  });

  // Export Copiers
  copyMatchesBtn.addEventListener('click', () => {
    const matchesLines = STATE.displayList
      .filter(item => item.type === 'line')
      .map(item => item.line.text)
      .join('\n');
    copyToClipboard(matchesLines, "Copied all matched lines to clipboard!");
  });



  // Bookmark navigation & cycling (F2 / Shift+F2)
  function cycleBookmarks(direction = 'next') {
    if (STATE.bookmarks.size === 0) return;

    // Get bookmark line indices inside the current displayList
    const bookmarkDisplayIndices = [];
    for (let i = 0; i < STATE.displayList.length; i++) {
      const item = STATE.displayList[i];
      if (item.type === 'line' && STATE.bookmarks.has(item.line.originalIndex)) {
        bookmarkDisplayIndices.push(i);
      }
    }

    if (bookmarkDisplayIndices.length === 0) {
      showToast("Bookmarked lines are hidden under active filters.");
      return;
    }

    // Determine current visible viewport boundaries on-the-fly
    const scrollTop = STATE.scrollContainer.scrollTop;
    const viewportHeight = STATE.scrollContainer.clientHeight;
    const currentViewportTopLine = STATE.isVirtual
      ? Math.floor(scrollTop / STATE.LINE_HEIGHT)
      : Math.floor(scrollTop / 22);
    const visibleRowCount = STATE.isVirtual
      ? Math.ceil(viewportHeight / STATE.LINE_HEIGHT)
      : Math.ceil(viewportHeight / 22);

    const isLastTargetVisible = STATE.lastProgrammaticBookmarkIndex !== -1 &&
      STATE.lastProgrammaticBookmarkIndex >= currentViewportTopLine &&
      STATE.lastProgrammaticBookmarkIndex < currentViewportTopLine + visibleRowCount;

    const referenceIndex = isLastTargetVisible ? STATE.lastProgrammaticBookmarkIndex : currentViewportTopLine;

    let targetDisplayIdx = -1;

    if (direction === 'next') {
      const searchStart = isLastTargetVisible ? referenceIndex : referenceIndex - 1;
      targetDisplayIdx = bookmarkDisplayIndices.find(idx => idx > searchStart);
      if (targetDisplayIdx === undefined) targetDisplayIdx = bookmarkDisplayIndices[0]; // cycle wrap
    } else {
      const reversed = [...bookmarkDisplayIndices].reverse();
      const searchStart = isLastTargetVisible ? referenceIndex : referenceIndex + visibleRowCount;
      targetDisplayIdx = reversed.find(idx => idx < searchStart);
      if (targetDisplayIdx === undefined) targetDisplayIdx = bookmarkDisplayIndices[bookmarkDisplayIndices.length - 1]; // cycle wrap
    }

    STATE.lastProgrammaticBookmarkIndex = targetDisplayIdx;
    STATE.activeNavigatedIndex = targetDisplayIdx;
    render();

    if (targetDisplayIdx !== -1) {
      scrollToIndex(targetDisplayIdx);
      const targetItem = STATE.displayList[targetDisplayIdx];
      const targetOrigIdx = targetItem.line.originalIndex;
      STATE.lastNavigatedBookmark = targetOrigIdx;

      // Flash target row visually
      setTimeout(() => {
        const rowEl = STATE.shadowRoot.querySelector(`.log-row[data-orig-idx="${targetOrigIdx}"]`);
        if (rowEl) {
          rowEl.style.transition = 'background-color 0.1s ease';
          rowEl.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
          setTimeout(() => {
            rowEl.style.backgroundColor = '';
          }, 600);
        }
      }, 50);
    }
  }

  navBookmarksPrev.addEventListener('click', () => {
    cycleBookmarks('prev');
  });

  navBookmarksNext.addEventListener('click', () => {
    cycleBookmarks('next');
  });

  // Global word wrap toggle
  toggleWrapBtn.addEventListener('click', () => {
    STATE.globalWrap = !STATE.globalWrap;
    toggleWrapBtn.classList.toggle('active', STATE.globalWrap);

    if (STATE.isVirtual) {
      showToast(STATE.globalWrap ? "Word Wrap enabled. Custom lines height calculation may affect scrollbar accuracy." : "Word Wrap disabled.");
    }

    render();
  });

  // Restore raw browser view
  restoreViewBtn.addEventListener('click', () => {
    document.body.innerHTML = originalBodyHTML;
    document.body.setAttribute('style', originalBodyStyle);
    window.LOGLENS_INITIALIZED = false;
  });

  // Export diagnostic logs to clipboard for triage
  exportDiagBtn.addEventListener('click', () => {
    diagLog('action:export-diagnostics', { diagCount: DIAG_LOGS.length });
    const logString = JSON.stringify(DIAG_LOGS, null, 2);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(logString)
        .then(() => showToast("Diagnostics logs copied to clipboard! Ready to share."))
        .catch((err) => {
          diagLog('error:clipboard-write-failed', { error: err.message });
          copyFallback(logString);
        });
    } else {
      copyFallback(logString);
    }
  });

  function copyFallback(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showToast("Diagnostics logs copied to clipboard! Ready to share.");
    } catch (e) {
      console.error("LogLens: Fallback copy failed.", e);
      showToast("Failed to copy diagnostics.");
    }
  }

  // Target navigation & cycling (Errors / matches F8 / Shift+F8)
  navTargetPrev.addEventListener('click', () => {
    cycleNavigationTarget('prev');
  });

  navTargetNext.addEventListener('click', () => {
    cycleNavigationTarget('next');
  });

  // Listen scroll event
  STATE.scrollContainer.addEventListener('scroll', () => {
    if (STATE.isVirtual) {
      requestAnimationFrame(render);
    }
  }, { passive: true });

  // 8. Event Delegation (Viewer interactions: Bookmarks, Gaps, JSON)
  viewer.addEventListener('click', (e) => {
    const path = e.composedPath();

    // Check click on JSON formatter `{}` button
    const jsonBtn = path.find(el => el.classList && el.classList.contains('json-btn'));
    if (jsonBtn) {
      const origIdx = parseInt(jsonBtn.dataset.lineIndex, 10);
      openJSONModal(origIdx);
      return;
    }

    // Check click on bi-directional context arrow `>` button
    const expandBtn = path.find(el => el.classList && el.classList.contains('expand-btn'));
    if (expandBtn) {
      const origIdx = parseInt(expandBtn.dataset.lineIndex, 10);
      toggleContextExpansion(origIdx);
      return;
    }

    // Check click on the log gutter itself (to toggle bookmark)
    const gutterEl = path.find(el => el.classList && el.classList.contains('log-gutter'));
    if (gutterEl) {
      const rowEl = path.find(el => el.classList && el.classList.contains('log-row'));
      if (rowEl) {
        const origIdx = parseInt(rowEl.dataset.origIdx, 10);
        toggleBookmark(origIdx);
      }
      return;
    }

    // Check click on gap expand buttons
    const gapBtn = path.find(el => el.classList && el.classList.contains('gap-btn'));
    if (gapBtn) {
      const start = parseInt(gapBtn.dataset.gapStart, 10);
      const end = parseInt(gapBtn.dataset.gapEnd, 10);

      if (gapBtn.classList.contains('show-more')) {
        const mode = gapBtn.dataset.mode;
        expandGap(start, end, mode, 20);
      } else if (gapBtn.classList.contains('show-all')) {
        expandGap(start, end, 'all');
      }
      return;
    }

  });

  // Global hotkeys (F8 / Shift+F8 for error navigation, F2 for bookmarks, Escape for modals)
  window.addEventListener('keydown', (e) => {
    // If Escape is pressed
    if (e.key === 'Escape') {
      const hModal = STATE.shadowRoot.getElementById('highlights-modal');
      const modal = STATE.shadowRoot.querySelector('.json-modal-overlay');
      if (hModal && !hModal.classList.contains('hidden')) {
        hModal.classList.add('hidden');
      } else if (modal) {
        modal.remove();
      } else {
        // Clear filters but retain bookmarks
        STATE.searchQuery = '';
        searchInput.value = '';
        presetTrigger.textContent = '📋 Presets';
        presetTrigger.classList.remove('active');
        STATE.filterMode = 'all';
        badgeErrors.classList.remove('active');
        badgeWarnings.classList.remove('active');
        badgeBookmarks.classList.remove('active');
        computeDisplayList(true);
        render();
      }
      return;
    }

    // F2 cycles bookmarks, Shift+F2 cycles backwards
    if (e.key === 'F2') {
      e.preventDefault();
      cycleBookmarks(e.shiftKey ? 'prev' : 'next');
      return;
    }

    // Alt+W toggles word wrap
    if (e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      toggleWrapBtn.click();
      return;
    }

    // Alt+H toggles multi-color highlights
    if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      toggleHighlightsBtn.click();
      return;
    }

    // F8 cycles errors/matches, Shift+F8 cycles backwards
    if (e.key === 'F8') {
      e.preventDefault();
      cycleNavigationTarget(e.shiftKey ? 'prev' : 'next');
      return;
    }

    // Ctrl+End to scroll to bottom of log viewport without shifting outer page layout
    if (e.ctrlKey && e.key === 'End') {
      e.preventDefault();
      STATE.scrollContainer.scrollTop = STATE.scrollContainer.scrollHeight;
      return;
    }

    // Ctrl+Home to scroll to top of log viewport
    if (e.ctrlKey && e.key === 'Home') {
      e.preventDefault();
      STATE.scrollContainer.scrollTop = 0;
      return;
    }
  });


  // 9. Core Engine Algorithms

  // Compute Display List (Filtering)
  function computeDisplayList(isFilterChange = false) {
    if (isFilterChange) {
      STATE.expandedLines.clear();
    }
    const list = [];
    const query = STATE.searchQuery;
    const isFiltered = query.trim() !== '' || STATE.filterMode !== 'all';

    // Toggle copy and clear filter buttons visibility
    copyMatchesBtn.classList.toggle('hidden', !isFiltered);
    if (clearFiltersBtn) {
      clearFiltersBtn.classList.toggle('hidden', !isFiltered);
    }

    // Reset last navigated index on search/filter changes
    STATE.lastNavigatedTargetIndex = -1;
    STATE.lastProgrammaticTargetIndex = -1;
    STATE.lastProgrammaticBookmarkIndex = -1;
    STATE.lastNavigatedBookmark = -1;
    STATE.activeNavigatedIndex = -1;

    const navGroupErrors = STATE.shadowRoot.getElementById('nav-group-errors');
    if (navGroupErrors) {
      if (isFiltered) {
        navGroupErrors.classList.remove('nav-mode-error');
        navGroupErrors.classList.add('nav-mode-search');
      } else {
        navGroupErrors.classList.remove('nav-mode-search');
        navGroupErrors.classList.add('nav-mode-error');
      }
    }

    // Sync bookmarks nav group class for compatibility (replaces CSS :has() dependency)
    const navBookmarksGroup = STATE.shadowRoot.querySelector('.bookmarks-nav-group');
    if (navBookmarksGroup) {
      navBookmarksGroup.classList.toggle('has-bookmarks', STATE.bookmarks.size > 0);
    }

    if (!isFiltered) {
      // Map all lines directly
      for (let i = 0; i < STATE.allLines.length; i++) {
        list.push({ type: 'line', line: STATE.allLines[i] });
      }
      STATE.matchedIndices = new Set();
      if (navTargetPrev && navTargetNext) {
        navTargetPrev.innerHTML = `🔴 ⤒`;
        navTargetNext.innerHTML = `🔴 ⤓`;
        navTargetPrev.title = "Previous Error (Shift+F8)";
        navTargetNext.title = "Next Error (F8)";
      }
      STATE.displayList = list;

      const counterEl = STATE.shadowRoot.getElementById('loglens-lines-counter');
      if (counterEl) {
        counterEl.textContent = ` ${STATE.allLines.length.toLocaleString()} / ${STATE.allLines.length.toLocaleString()}`;
      }

      diagLog('filter:clear', { total: STATE.allLines.length });
      return;
    }

    // Setup filter matches
    let matches = [];

    if (STATE.filterMode === 'errors') {
      for (let i = 0; i < STATE.allLines.length; i++) {
        if (STATE.allLines[i].isError) matches.push(i);
      }
    } else if (STATE.filterMode === 'warnings') {
      for (let i = 0; i < STATE.allLines.length; i++) {
        if (STATE.allLines[i].isWarning) matches.push(i);
      }
    } else if (STATE.filterMode === 'bookmarks') {
      for (let i = 0; i < STATE.allLines.length; i++) {
        if (STATE.bookmarks.has(i + 1)) matches.push(i);
      }
    } else if (query) {
      // Compiled regex or string match
      let tester;
      if (STATE.useRegex) {
        try {
          tester = new RegExp(query, STATE.caseSensitive ? 'i' : 'gi'); // No global g flag for test
        } catch (e) {
          // Invalid regex fallback
          tester = null;
        }
      }

      const queryLower = STATE.caseSensitive ? query : query.toLowerCase();

      for (let i = 0; i < STATE.allLines.length; i++) {
        const text = STATE.allLines[i].text;
        let matched = false;

        if (STATE.useRegex) {
          if (tester) {
            matched = tester.test(text);
          }
        } else {
          matched = STATE.caseSensitive
            ? text.includes(queryLower)
            : text.toLowerCase().includes(queryLower);
        }

        if (matched) {
          matches.push(i);
        }
      }
    }

    STATE.matchedIndices = new Set(matches);

    if (navTargetPrev && navTargetNext) {
      navTargetPrev.innerHTML = `🔍 ⤒`;
      navTargetNext.innerHTML = `🔍 ⤓`;
      navTargetPrev.title = "Previous Match (Shift+F8)";
      navTargetNext.title = "Next Match (F8)";
    }

    if (!STATE.searchFilterEnabled) {
      for (let i = 0; i < STATE.allLines.length; i++) {
        list.push({ type: 'line', line: STATE.allLines[i] });
      }
      STATE.displayList = list;

      const counterEl = STATE.shadowRoot.getElementById('loglens-lines-counter');
      if (counterEl) {
        counterEl.textContent = ` ${STATE.allLines.length.toLocaleString()} / ${STATE.allLines.length.toLocaleString()} (${matches.length.toLocaleString()} matched)`;
      }

      diagLog('filter:disabled', { matchedCount: matches.length, total: STATE.allLines.length, filterMode: STATE.filterMode, query });
      return;
    }

    // Construct the display list WITHOUT Gaps initially (filtered lines show one after another)
    if (matches.length === 0) {
      STATE.displayList = [];
      const counterEl = STATE.shadowRoot.getElementById('loglens-lines-counter');
      if (counterEl) {
        counterEl.textContent = ` 0 / ${STATE.allLines.length.toLocaleString()}`;
      }
      diagLog('filter:applied', { matchedCount: 0, total: STATE.allLines.length, filterMode: STATE.filterMode, query });
      return;
    }

    for (let m = 0; m < matches.length; m++) {
      list.push({ type: 'line', line: STATE.allLines[matches[m]] });
    }

    STATE.displayList = list;

    // Apply expansions for all active expanded lines
    if (STATE.expandedLines && STATE.expandedLines.size > 0) {
      const sortedExpanded = Array.from(STATE.expandedLines).sort((a, b) => a - b);
      for (const L of sortedExpanded) {
        if (STATE.matchedIndices.has(L)) {
          expandContextAroundLine(L + 1, true);
        }
      }
    }

    const counterEl = STATE.shadowRoot.getElementById('loglens-lines-counter');
    if (counterEl) {
      // displayList.length is the correct "showing" count since context expansions append rows to the list!
      counterEl.textContent = `
       ${STATE.displayList.length.toLocaleString()} / ${STATE.allLines.length.toLocaleString()}`;
    }

    diagLog('filter:applied', { matchedCount: matches.length, showingCount: STATE.displayList.length, total: STATE.allLines.length, filterMode: STATE.filterMode, query });
  }

  // Splicing/expanding gap nodes
  function expandGap(start, end, mode, amount = 5) {
    // Find index of this gap item in the displayList
    const gapIdx = STATE.displayList.findIndex(
      item => item.type === 'gap' && item.start === start && item.end === end
    );
    if (gapIdx === -1) return;

    const listToInsert = [];

    if (mode === 'all') {
      for (let i = start; i <= end; i++) {
        listToInsert.push({ type: 'line', line: STATE.allLines[i] });
      }
      STATE.displayList.splice(gapIdx, 1, ...listToInsert);
    } else if (mode === 'top') {
      // Reveal the first 'amount' lines (e.g. from index `start` to `start + amount - 1`)
      const limit = Math.min(end, start + amount - 1);
      for (let i = start; i <= limit; i++) {
        listToInsert.push({ type: 'line', line: STATE.allLines[i] });
      }
      // If there are still hidden lines left, insert new resized gap
      if (limit < end) {
        listToInsert.push({ type: 'gap', start: limit + 1, end: end, direction: 'below' });
      }
      STATE.displayList.splice(gapIdx, 1, ...listToInsert);
    } else if (mode === 'bottom') {
      // Reveal the last 'amount' lines (e.g. from index `end - amount + 1` to `end`)
      const limit = Math.max(start, end - amount + 1);
      if (limit > start) {
        listToInsert.push({ type: 'gap', start: start, end: limit - 1, direction: 'above' });
      }
      for (let i = limit; i <= end; i++) {
        listToInsert.push({ type: 'line', line: STATE.allLines[i] });
      }
      STATE.displayList.splice(gapIdx, 1, ...listToInsert);
    }

    render();
  }

  // Bi-directional expansion around a filtered line
  function expandContextAroundLine(originalIndex, skipRender = false) {
    const displayIdx = STATE.displayList.findIndex(
      item => item.type === 'line' && item.line.originalIndex === originalIndex
    );
    if (displayIdx === -1) return;

    const lineItem = STATE.displayList[displayIdx];
    const L = lineItem.line.originalIndex - 1; // 0-based index in STATE.allLines

    // Check preceding gap
    let showPrecedingGap = false;
    let gapStart = 0;
    let gapEnd = L - 1;

    if (displayIdx > 0) {
      const prevItem = STATE.displayList[displayIdx - 1];
      if (prevItem.type === 'line') {
        const L_prev = prevItem.line.originalIndex - 1;
        if (L - L_prev > 1) {
          showPrecedingGap = true;
          gapStart = L_prev + 1;
        }
      }
    } else {
      if (L > 0) {
        showPrecedingGap = true;
        gapStart = 0;
      }
    }

    // Check succeeding gap
    let showSucceedingGap = false;
    let gapStartBelow = L + 1;
    let gapEndBelow = STATE.allLines.length - 1;

    if (displayIdx < STATE.displayList.length - 1) {
      const nextItem = STATE.displayList[displayIdx + 1];
      if (nextItem.type === 'line') {
        const L_next = nextItem.line.originalIndex - 1;
        if (L_next - L > 1) {
          showSucceedingGap = true;
          gapEndBelow = L_next - 1;
        }
      }
    } else {
      if (L < STATE.allLines.length - 1) {
        showSucceedingGap = true;
        gapEndBelow = STATE.allLines.length - 1;
      }
    }

    // Splice in gap items
    if (showSucceedingGap) {
      const revealEnd = Math.min(gapEndBelow, L + 5);
      const itemsBelow = [];
      for (let i = L + 1; i <= revealEnd; i++) {
        itemsBelow.push({ type: 'line', line: STATE.allLines[i] });
      }
      if (revealEnd < gapEndBelow) {
        itemsBelow.push({ type: 'gap', start: revealEnd + 1, end: gapEndBelow, direction: 'below' });
      }
      STATE.displayList.splice(displayIdx + 1, 0, ...itemsBelow);
    }
    if (showPrecedingGap) {
      const revealStart = Math.max(gapStart, L - 5);
      const itemsAbove = [];
      if (revealStart > gapStart) {
        itemsAbove.push({ type: 'gap', start: gapStart, end: revealStart - 1, direction: 'above' });
      }
      for (let i = revealStart; i < L; i++) {
        itemsAbove.push({ type: 'line', line: STATE.allLines[i] });
      }
      STATE.displayList.splice(displayIdx, 0, ...itemsAbove);
    }

    if (!skipRender) {
      render();
    }
  }

  // Toggle expansion state of a matching line
  function toggleContextExpansion(origIdx) {
    const L = origIdx - 1; // 0-based index
    if (STATE.expandedLines.has(L)) {
      STATE.expandedLines.delete(L);
    } else {
      STATE.expandedLines.add(L);
    }
    computeDisplayList();
    render();
  }

  // Bookmarking
  function toggleBookmark(origIdx) {
    if (STATE.bookmarks.has(origIdx)) {
      STATE.bookmarks.delete(origIdx);
    } else {
      STATE.bookmarks.add(origIdx);
    }

    const size = STATE.bookmarks.size;
    if (badgeBookmarks) {
      badgeBookmarks.innerHTML = `⭐ ${size}`;
    }
    if (navBookmarksPrev && navBookmarksNext) {
      navBookmarksPrev.disabled = size === 0;
      navBookmarksNext.disabled = size === 0;
    }
    const navBookmarksGroup = STATE.shadowRoot.querySelector('.bookmarks-nav-group');
    if (navBookmarksGroup) {
      navBookmarksGroup.classList.toggle('has-bookmarks', size > 0);
    }

    // If currently filtered by bookmarks, we need to update the display list and render
    if (STATE.filterMode === 'bookmarks') {
      computeDisplayList(true);
      render();
    } else {
      // Trigger visual repaint of gutter
      const rowEl = STATE.shadowRoot.querySelector(`.log-row[data-orig-idx="${origIdx}"]`);
      if (rowEl) {
        rowEl.classList.toggle('bookmarked', STATE.bookmarks.has(origIdx));
      }
    }
  }



  // Dynamic Gutter Width Sizing based on line digits and active filter status
  function updateGutterWidth() {
    const maxLineDigits = String(STATE.stats.total).length;
    const lineNumWidth = maxLineDigits * 8; // Consolas monospace font average digit width (approx 8px)
    const isFiltered = STATE.searchQuery.trim() !== '' || STATE.filterMode !== 'all';

    // Math:
    // - If filtered: JSON button (24px) + Gap (4px) + Expand button (18px) + Gap (4px) + lineNumWidth + margins (20px) = 70 + lineNumWidth
    // - If not filtered: JSON button (24px) + Gap (4px) + lineNumWidth + margins (16px) = 44 + lineNumWidth
    const gutterWidth = isFiltered
      ? (70 + lineNumWidth)
      : (44 + lineNumWidth);

    let gutterStyle = STATE.shadowRoot.getElementById('dynamic-gutter-style');
    if (!gutterStyle) {
      gutterStyle = document.createElement('style');
      gutterStyle.id = 'dynamic-gutter-style';
      STATE.shadowRoot.appendChild(gutterStyle);
    }
    gutterStyle.textContent = `
      .log-gutter {
        width: ${gutterWidth}px !important;
        min-width: ${gutterWidth}px !important;
      }
    `;
  }

  // Render loop
  function render() {
    updateGutterWidth();
    if (STATE.isVirtual) {
      renderVirtual();
    } else {
      renderRaw();
    }
  }

  // High performance virtual list rendering
  function renderVirtual() {
    const scrollTop = STATE.scrollContainer.scrollTop;
    const viewportHeight = STATE.scrollContainer.clientHeight;

    const totalLinesCount = STATE.displayList.length;
    const totalHeight = (totalLinesCount * STATE.LINE_HEIGHT) + 120;

    // Adjust scrollable spacer height
    const spacer = STATE.shadowRoot.getElementById('loglens-spacer');
    if (spacer) {
      spacer.style.height = `${totalHeight}px`;
    }

    // Determine slice indices
    let startIdx = Math.max(0, Math.floor(scrollTop / STATE.LINE_HEIGHT) - STATE.OVERSCAN);
    let endIdx = Math.min(totalLinesCount - 1, Math.floor((scrollTop + viewportHeight) / STATE.LINE_HEIGHT) + STATE.OVERSCAN);

    // Position lines container. In flow-wrap mode, we translate the container to the topOffset of the first visible row.
    STATE.linesContainer.style.transform = `translateY(${startIdx * STATE.LINE_HEIGHT}px)`;

    const query = STATE.searchQuery;
    const queryTerms = query ? query.split('|').filter(Boolean) : [];

    // Build single regex matching all query terms for highlight color mapping
    let highlightRegex = null;
    if (queryTerms.length > 0) {
      try {
        const escaped = queryTerms.map(t => escapeRegExp(t)).join(')|(');
        highlightRegex = new RegExp(`(${escaped})`, STATE.caseSensitive ? 'g' : 'gi');
      } catch (e) { }
    }

    let html = '';
    for (let i = startIdx; i <= endIdx; i++) {
      const item = STATE.displayList[i];
      const topOffset = (i - startIdx) * STATE.LINE_HEIGHT;

      // Handle custom relative placement inline style configurations during wrap
      const positionStyle = STATE.globalWrap
        ? `position:relative; min-height:${STATE.LINE_HEIGHT}px;`
        : `position:absolute; top:${topOffset}px; height:${STATE.LINE_HEIGHT}px;`;

      if (item.type === 'gap') {
        const hiddenCount = (item.end - item.start + 1);
        const mode = item.direction === 'above' ? 'bottom' : 'top';
        const label = item.direction === 'above' ? '↑ Show More' : '↓ Show More';
        const gapPositionStyle = STATE.globalWrap
          ? `position:relative; height:${STATE.LINE_HEIGHT}px;`
          : `position:absolute; top:${topOffset}px; height:${STATE.LINE_HEIGHT}px;`;

        html += `
          <div class="gap-row" style="${gapPositionStyle}">
            <div class="gap-container">
              <span class="gap-info">⤜ ${hiddenCount.toLocaleString()} hidden ⤛</span>
              <button class="gap-btn show-more" data-gap-start="${item.start}" data-gap-end="${item.end}" data-mode="${mode}">${label}</button>
              <button class="gap-btn show-all" data-gap-start="${item.start}" data-gap-end="${item.end}">Show All</button>
            </div>
          </div>
        `;
      } else {
        const line = item.line;
        const origIdx = line.originalIndex;
        const isBookmarked = STATE.bookmarks.has(origIdx);

        const displayText = applyHighlightRules(
          line.text,
          queryTerms,
          highlightRegex,
          STATE.multiHighlights,
          MULTI_HIGHLIGHT_COLORS
        );

        const wrapClass = STATE.globalWrap ? 'wrap-enabled' : '';
        const errorClass = line.isError ? 'log-row-error' : '';
        const warnClass = line.isWarning ? 'log-row-warning' : '';
        const bookmarkClass = isBookmarked ? 'bookmarked' : '';

        const isFiltered = query !== '' || STATE.filterMode !== 'all';
        const isMatch = STATE.matchedIndices.has(origIdx - 1);
        const isExpanded = STATE.expandedLines.has(origIdx - 1);
        const isActiveNav = (i === STATE.activeNavigatedIndex);

        const expandedClass = isExpanded ? 'expanded-match' : '';
        const expandBtnClass = isMatch ? 'can-expand' : '';
        const expandBtnStyle = (isFiltered && STATE.searchFilterEnabled) ? 'display: flex;' : 'display: none;';
        const activeNavClass = isActiveNav ? 'active-nav-line' : '';
        const matchClass = (isFiltered && STATE.searchFilterEnabled) ? (isMatch ? 'filter-match' : 'context-line') : '';

        const expandSymbol = isExpanded ? '▼' : '>';
        const expandTitle = isExpanded ? 'Collapse context' : 'Show surrounding context';

        html += `
          <div class="log-row ${wrapClass} ${errorClass} ${warnClass} ${bookmarkClass} ${expandedClass} ${activeNavClass} ${matchClass}" 
               data-orig-idx="${origIdx}"
               style="${positionStyle}">
            <div class="log-gutter">
              <button class="gutter-btn json-btn ${line.hasJson ? 'has-json' : ''}" 
                      data-line-index="${origIdx}" 
                      title="Format JSON">{ }</button>
              <button class="gutter-btn expand-btn ${expandBtnClass}" 
                      style="${expandBtnStyle}" 
                      data-line-index="${origIdx}" 
                      title="${expandTitle}">${expandSymbol}</button>
              <span class="line-number" data-line-index="${origIdx}">${origIdx}</span>
            </div>
            <div class="log-text">${displayText}</div>
          </div>
        `;
      }
    }
    STATE.linesContainer.innerHTML = html;
  }

  // Non-virtualized layout loading (under 20K lines)
  function renderRaw() {
    // Spacer height is irrelevant in raw layout
    const spacer = STATE.shadowRoot.getElementById('loglens-spacer');
    if (spacer) {
      spacer.style.height = '0px';
    }

    const query = STATE.searchQuery;
    const queryTerms = query ? query.split('|').filter(Boolean) : [];

    let highlightRegex = null;
    if (queryTerms.length > 0) {
      try {
        const escaped = queryTerms.map(t => escapeRegExp(t)).join(')|(');
        highlightRegex = new RegExp(`(${escaped})`, STATE.caseSensitive ? 'g' : 'gi');
      } catch (e) { }
    }

    let html = '';
    for (let i = 0; i < STATE.displayList.length; i++) {
      const item = STATE.displayList[i];

      if (item.type === 'gap') {
        const hiddenCount = (item.end - item.start + 1);
        const mode = item.direction === 'above' ? 'bottom' : 'top';
        const label = item.direction === 'above' ? '↑ Show More' : '↓ Show More';
        html += `
          <div class="gap-row">
            <div class="gap-container">
              <span class="gap-info">⤜ ${hiddenCount.toLocaleString()} hidden ⤛</span>
              <button class="gap-btn show-more" data-gap-start="${item.start}" data-gap-end="${item.end}" data-mode="${mode}">${label}</button>
              <button class="gap-btn show-all" data-gap-start="${item.start}" data-gap-end="${item.end}">Show All</button>
            </div>
          </div>
        `;
      } else {
        const line = item.line;
        const origIdx = line.originalIndex;
        const isBookmarked = STATE.bookmarks.has(origIdx);

        const displayText = applyHighlightRules(
          line.text,
          queryTerms,
          highlightRegex,
          STATE.multiHighlights,
          MULTI_HIGHLIGHT_COLORS
        );

        const wrapClass = STATE.globalWrap ? 'wrap-enabled' : '';
        const errorClass = line.isError ? 'log-row-error' : '';
        const warnClass = line.isWarning ? 'log-row-warning' : '';
        const bookmarkClass = isBookmarked ? 'bookmarked' : '';

        const isFiltered = query !== '' || STATE.filterMode !== 'all';
        const isMatch = STATE.matchedIndices.has(origIdx - 1);
        const isExpanded = STATE.expandedLines.has(origIdx - 1);
        const isActiveNav = (i === STATE.activeNavigatedIndex);

        const expandedClass = isExpanded ? 'expanded-match' : '';
        const expandBtnClass = isMatch ? 'can-expand' : '';
        const expandBtnStyle = (isFiltered && STATE.searchFilterEnabled) ? 'display: flex;' : 'display: none;';
        const activeNavClass = isActiveNav ? 'active-nav-line' : '';
        const matchClass = (isFiltered && STATE.searchFilterEnabled) ? (isMatch ? 'filter-match' : 'context-line') : '';

        const expandSymbol = isExpanded ? '▼' : '>';
        const expandTitle = isExpanded ? 'Collapse context' : 'Show surrounding context';

        html += `
          <div class="log-row ${wrapClass} ${errorClass} ${warnClass} ${bookmarkClass} ${expandedClass} ${activeNavClass} ${matchClass}" data-orig-idx="${origIdx}">
            <div class="log-gutter">
              <button class="gutter-btn json-btn ${line.hasJson ? 'has-json' : ''}" 
                      data-line-index="${origIdx}" 
                      title="Format JSON">{ }</button>
              <button class="gutter-btn expand-btn ${expandBtnClass}" 
                      style="${expandBtnStyle}" 
                      data-line-index="${origIdx}" 
                      title="${expandTitle}">${expandSymbol}</button>
              <span class="line-number" data-line-index="${origIdx}">${origIdx}</span>
            </div>
            <div class="log-text">${displayText}</div>
          </div>
        `;
      }
    }

    STATE.linesContainer.innerHTML = html;
  }

  // Scroll to index helper
  function scrollToIndex(index) {
    STATE.isAutoScrolling = true;
    clearTimeout(STATE.autoScrollTimeout);
    STATE.autoScrollTimeout = setTimeout(() => {
      STATE.isAutoScrolling = false;
    }, 850); // 850ms covers the smooth scroll transitions

    if (STATE.isVirtual) {
      STATE.scrollContainer.scrollTop = index * STATE.LINE_HEIGHT - (STATE.scrollContainer.clientHeight / 3);
    } else {
      // In raw mode, calculate offset and assign scrollTop directly to prevent window scrolling glitches
      const rows = STATE.linesContainer.children;
      if (rows && rows[index]) {
        const rowOffset = rows[index].offsetTop;
        const targetScrollTop = rowOffset - (STATE.scrollContainer.clientHeight / 3);
        STATE.scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }
  }

  // Cycle through error tags or filtered lines (F8)
  function cycleNavigationTarget(direction) {
    const isFiltered = STATE.searchQuery.trim() !== '' || STATE.filterMode !== 'all';
    const targetIndices = [];

    for (let i = 0; i < STATE.displayList.length; i++) {
      const item = STATE.displayList[i];
      if (item.type === 'line') {
        if (isFiltered) {
          if (STATE.matchedIndices.has(item.line.originalIndex - 1)) {
            targetIndices.push(i);
          }
        } else {
          if (item.line.isError) {
            targetIndices.push(i);
          }
        }
      }
    }

    if (targetIndices.length === 0) {
      showToast(isFiltered ? "No matching lines found to navigate." : "No error log lines found in the active view.");
      return;
    }

    // Determine current visible viewport boundaries on-the-fly
    const scrollTop = STATE.scrollContainer.scrollTop;
    const viewportHeight = STATE.scrollContainer.clientHeight;
    const currentViewportTopLine = STATE.isVirtual
      ? Math.floor(scrollTop / STATE.LINE_HEIGHT)
      : Math.floor(scrollTop / 22);
    const visibleRowCount = STATE.isVirtual
      ? Math.ceil(viewportHeight / STATE.LINE_HEIGHT)
      : Math.ceil(viewportHeight / 22);

    const isLastTargetVisible = STATE.lastProgrammaticTargetIndex !== -1 &&
      STATE.lastProgrammaticTargetIndex >= currentViewportTopLine &&
      STATE.lastProgrammaticTargetIndex < currentViewportTopLine + visibleRowCount;

    const referenceIndex = isLastTargetVisible ? STATE.lastProgrammaticTargetIndex : currentViewportTopLine;

    let targetIdx = -1;

    if (direction === 'next') {
      const searchStart = isLastTargetVisible ? referenceIndex : referenceIndex - 1;
      targetIdx = targetIndices.find(idx => idx > searchStart);
      if (targetIdx === undefined) targetIdx = targetIndices[0]; // cycle wrap
    } else {
      const reversed = [...targetIndices].reverse();
      const searchStart = isLastTargetVisible ? referenceIndex : referenceIndex + visibleRowCount;
      targetIdx = reversed.find(idx => idx < searchStart);
      if (targetIdx === undefined) targetIdx = targetIndices[targetIndices.length - 1]; // cycle wrap
    }

    STATE.lastProgrammaticTargetIndex = targetIdx;
    STATE.lastNavigatedTargetIndex = targetIdx;
    STATE.activeNavigatedIndex = targetIdx;
    render();

    if (targetIdx !== -1) {
      scrollToIndex(targetIdx);

      // Flash target row visually
      const targetItem = STATE.displayList[targetIdx];
      if (targetItem && targetItem.type === 'line') {
        const origIdx = targetItem.line.originalIndex;
        setTimeout(() => {
          const rowEl = STATE.shadowRoot.querySelector(`.log-row[data-orig-idx="${origIdx}"]`);
          if (rowEl) {
            rowEl.style.transition = 'background-color 0.1s ease';
            rowEl.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
            setTimeout(() => {
              rowEl.style.backgroundColor = '';
            }, 600);
          }
        }, 50);
      }
    }
  }


  // 10. Multi-JSON Parser & syntax highlighters

  // Extract all valid JSON objects and formatted custom bracketed data lists from text
  function extractAllJSON(str) {
    const results = [];
    let i = 0;
    while (i < str.length) {
      const char = str[i];
      if (char === '{' || char === '[' || char === '(') {
        let braceCount = 0;
        let bracketCount = 0;
        let parenCount = 0;
        let insideString = false;
        let escaped = false;
        let foundEnd = -1;

        for (let j = i; j < str.length; j++) {
          const c = str[j];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (c === '\\') {
            escaped = true;
            continue;
          }
          if (c === '"') {
            insideString = !insideString;
            continue;
          }
          if (!insideString) {
            if (c === '{') braceCount++;
            else if (c === '}') {
              braceCount--;
              if (braceCount === 0 && bracketCount === 0 && parenCount === 0) {
                foundEnd = j;
                break;
              }
            } else if (c === '[') bracketCount++;
            else if (c === ']') {
              bracketCount--;
              if (braceCount === 0 && bracketCount === 0 && parenCount === 0) {
                foundEnd = j;
                break;
              }
            } else if (c === '(') parenCount++;
            else if (c === ')') {
              parenCount--;
              if (braceCount === 0 && bracketCount === 0 && parenCount === 0) {
                foundEnd = j;
                break;
              }
            }
          }
        }

        if (foundEnd !== -1) {
          const candidate = str.substring(i, foundEnd + 1);
          if (candidate.length > 3) {
            // 1. Try strict JSON
            try {
              const parsed = JSON.parse(candidate);
              results.push({ raw: candidate, parsed });
              i = foundEnd + 1;
              continue;
            } catch (e) {
              // 2. Try Python dict format cleaning (single quotes to double quotes)
              try {
                const cleaned = candidate.replace(/'/g, '"');
                const parsed = JSON.parse(cleaned);
                results.push({ raw: candidate, parsed });
                i = foundEnd + 1;
                continue;
              } catch (err) {
                // 3. Try parsing loose custom key-value list [a: 1, b: 2] or python dict-like syntax
                if (candidate.startsWith('[') && (candidate.includes(':') || candidate.includes('=') || candidate.includes(','))) {
                  const parsed = parseLooseBracketContent(candidate);
                  if (parsed) {
                    results.push({ raw: candidate, parsed });
                    i = foundEnd + 1;
                    continue;
                  }
                }
                // 4. Fallback: Parse as a raw bracketed string using generic beautifier
                results.push({ raw: candidate, rawText: formatBracketText(candidate) });
                i = foundEnd + 1;
                continue;
              }
            }
          }
        }
      }
      i++;
    }
    return results;
  }

  function formatBracketText(str) {
    let indent = 0;
    let result = '';
    let idx = 0;
    while (idx < str.length) {
      const char = str[idx];
      if (char === '{' || char === '[' || char === '(') {
        result += char + '\n' + '  '.repeat(indent + 1);
        indent++;
      } else if (char === '}' || char === ']' || char === ')') {
        indent = Math.max(0, indent - 1);
        result += '\n' + '  '.repeat(indent) + char;
      } else if (char === ',') {
        result += char + '\n' + '  '.repeat(indent);
        if (str[idx + 1] === ' ') idx++; // Skip extra space after comma
      } else {
        result += char;
      }
      idx++;
    }
    return result;
  }

  function parseLooseBracketContent(rawStr) {
    const trimmed = rawStr.slice(1, -1).trim();
    if (!trimmed) return null;

    const elements = splitBracketElements(trimmed);
    const isKeyValue = elements.some(el => el.includes(':') || el.includes('='));

    if (isKeyValue) {
      const obj = {};
      elements.forEach(el => {
        const match = el.match(/([^:=]+)[:=](.*)/);
        if (match) {
          const k = match[1].trim();
          const v = match[2].trim();
          obj[k] = v;
        } else {
          obj[el.trim()] = "";
        }
      });
      return obj;
    } else if (elements.length > 1) {
      return elements.map(el => el.trim()).filter(Boolean);
    }
    return null;
  }

  function splitBracketElements(str) {
    const result = [];
    let current = "";
    let depth = 0;
    let insideString = false;
    let quoteChar = null;

    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (insideString) {
        if (c === quoteChar && str[i - 1] !== '\\') {
          insideString = false;
        }
        current += c;
      } else {
        if (c === '"' || c === "'") {
          insideString = true;
          quoteChar = c;
          current += c;
        } else if (c === '{' || c === '[') {
          depth++;
          current += c;
        } else if (c === '}' || c === ']') {
          depth--;
          current += c;
        } else if (c === ',' && depth === 0) {
          result.push(current);
          current = "";
        } else {
          current += c;
        }
      }
    }
    if (current.trim()) result.push(current);
    return result;
  }

  // Highlight syntax inside JSON
  function highlightJSON(jsonStr) {
    let html = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return html.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.slice(0, -1);
          return `<span class="${cls}">${match}</span>:`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  // Open formatted JSON/Bracket overlay modal
  function openJSONModal(originalIndex) {
    const line = STATE.allLines[originalIndex - 1];
    if (!line) return;

    const jsonBlocks = extractAllJSON(line.text);
    if (jsonBlocks.length === 0) {
      showToast("No valid bracketed structures found in this line.");
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'json-modal-overlay';

    let modalBodyHTML = '';
    for (let i = 0; i < jsonBlocks.length; i++) {
      const block = jsonBlocks[i];
      let formattedText;
      let highlightedHTML;
      let blockTitle;

      if (block.parsed) {
        formattedText = JSON.stringify(block.parsed, null, 2);
        highlightedHTML = highlightJSON(formattedText);
        blockTitle = `JSON Block #${i + 1}`;
      } else {
        formattedText = block.rawText;
        highlightedHTML = escapeHTML(formattedText);
        blockTitle = `Bracket Block #${i + 1}`;
      }

      block.formattedText = formattedText;

      modalBodyHTML += `
        <div class="json-block-card">
          <div class="json-block-header">
            <span class="json-block-title">${blockTitle}</span>
            <button class="gap-btn copy-single-json-btn" data-block-idx="${i}">Copy Formatted</button>
          </div>
          <pre class="json-block-pre">${highlightedHTML}</pre>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="json-modal-content">
        <div class="modal-header">
          <span class="modal-title">Bracket/JSON Blocks Formatted (Line ${originalIndex})</span>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
          ${modalBodyHTML}
        </div>
      </div>
    `;

    // Attach copy actions
    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-modal-btn') || e.target.classList.contains('json-modal-overlay')) {
        modal.remove();
        return;
      }
      if (e.target.classList.contains('copy-single-json-btn')) {
        const button = e.target;
        const blockIdx = parseInt(button.dataset.blockIdx, 10);
        const block = jsonBlocks[blockIdx];
        if (block && block.formattedText) {
          navigator.clipboard.writeText(block.formattedText)
            .then(() => {
              button.textContent = "Copied";
              button.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
              button.style.borderColor = "rgba(16, 185, 129, 0.4)";
              button.style.color = "#10b981";

              setTimeout(() => {
                button.textContent = "Copy Formatted";
                button.style.backgroundColor = "";
                button.style.borderColor = "";
                button.style.color = "";
              }, 2000);
            })
            .catch(() => showToast("Failed to copy."));
        }
      }
    });

    STATE.shadowRoot.appendChild(modal);
  }


  // 11. Clipboard and Toast Helpers
  function copyToClipboard(text, successMsg) {
    if (!text) {
      showToast("Nothing to copy!");
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMsg))
      .catch((err) => {
        console.error("Clipboard copy error:", err);
        showToast("Clipboard copy failed.");
      });
  }

  function showToast(message) {
    const container = STATE.shadowRoot.getElementById('loglens-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: rgba(18, 18, 18, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: #e2e8f0;
      padding: 8px 16px;
      font-size: 0.78rem;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      animation: fadeIn 0.2s ease-out;
      opacity: 0.95;
      pointer-events: auto;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }


  // 12. Pure utility functions
  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function compileKeywordsRegex(terms) {
    const substringAllowed = ['exception', 'error', 'fail', 'failed'];
    const parts = terms.map(term => {
      const escaped = escapeRegExp(term);
      // Only allow substring matching for concatenation-prone terms
      if (substringAllowed.includes(term.toLowerCase())) {
        return escaped;
      }
      return `\\b${escaped}\\b`;
    });
    return new RegExp(parts.join('|'), 'i');
  }

  // 13. Dynamic Settings Listener (Updates classification in real-time)
  chrome.storage.onChanged.addListener((changes) => {
    let needsReclassification = false;
    if (changes.filterPresets) {
      STATE.filterPresets = changes.filterPresets.newValue || [];
      updatePresetDropdown();
    }
    if (changes.customErrorTerms) {
      customErrorTerms = changes.customErrorTerms.newValue || [];
      needsReclassification = true;
    }
    if (changes.customWarnTerms) {
      customWarnTerms = changes.customWarnTerms.newValue || [];
      needsReclassification = true;
    }

    if (needsReclassification) {
      // Recalculate regexes
      const activeErrors = [...ERROR_TERMS, ...customErrorTerms];
      const activeWarns = [...WARN_TERMS, ...customWarnTerms];
      errorRegex = compileKeywordsRegex(activeErrors);
      warnRegex = compileKeywordsRegex(activeWarns);

      // Re-classify all lines and update stats
      STATE.stats.errors = 0;
      STATE.stats.warnings = 0;

      for (let i = 0; i < STATE.allLines.length; i++) {
        const line = STATE.allLines[i];
        const isStackTrace = traceRegex.test(line.text) || pythonTraceHeader.test(line.text) || pythonTraceLine.test(line.text) || causedByRegex.test(line.text);
        const isError = isStackTrace || errorRegex.test(line.text);
        const isWarning = !isError && warnRegex.test(line.text);

        line.isError = isError;
        line.isWarning = isWarning;

        if (isError) STATE.stats.errors++;
        if (isWarning) STATE.stats.warnings++;
      }

      // Update taskbar stats display inside Shadow DOM
      const badgeErrors = STATE.shadowRoot.getElementById('badge-errors');
      const badgeWarnings = STATE.shadowRoot.getElementById('badge-warnings');
      if (badgeErrors) badgeErrors.textContent = `🔴 ${STATE.stats.errors}`;
      if (badgeWarnings) badgeWarnings.textContent = `🟠 ${STATE.stats.warnings}`;

      // Re-run display list and render
      computeDisplayList(true);
      render();
    }
  });

  // Apply both search highlight regex and 10 multi-color highlight regexes to raw log line text
  function applyHighlightRules(rawText, queryTerms, searchRegex, multiHighlights, highlightColors) {
    let displayText = escapeHTML(rawText);
    let segments = [{ text: displayText, html: false }];

    // 1. Apply multi-color highlights (regex supported by default, case-insensitive)
    for (let idx = 0; idx < 10; idx++) {
      const term = multiHighlights[idx]?.text || '';
      if (!term.trim()) continue;

      try {
        const regex = new RegExp(term, 'gi');
        segments = splitSegments(segments, regex, (match) => {
          return `<mark class="log-multi-highlight" style="background-color: ${highlightColors[idx]}; color: #000000; font-weight: bold; border-radius: 2px; padding: 0 1px;">${match}</mark>`;
        });
      } catch (err) {
        // Ignore invalid user regex
      }
    }

    // 2. Apply search highlight regex
    if (searchRegex) {
      segments = splitSegments(segments, searchRegex, (match) => {
        let color = '#3b82f6';
        if (queryTerms && queryTerms.length > 0) {
          const matchedGroupIndex = queryTerms.findIndex(t => {
            try { return new RegExp(t, 'i').test(match); } catch (e) { return false; }
          });
          color = HIGHLIGHT_COLORS[matchedGroupIndex !== -1 ? matchedGroupIndex % HIGHLIGHT_COLORS.length : 0];
        }
        return `<mark class="log-highlight" style="background-color:${color};">${match}</mark>`;
      });
    }

    return segments.map(s => s.text).join('');
  }

  // Segment splitter utility supporting safe tag-skipping sequential regex matching
  function splitSegments(segments, regex, wrapFn) {
    const result = [];
    for (const seg of segments) {
      if (seg.html) {
        result.push(seg);
        continue;
      }

      const text = seg.text;
      let match;
      let lastIndex = 0;

      // Enforce global match flag
      const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
      const gRegex = new RegExp(regex.source, flags);

      let hasMatch = false;
      while ((match = gRegex.exec(text)) !== null) {
        // Avoid infinite loop on empty regex matches
        if (match[0].length === 0) {
          gRegex.lastIndex++;
          continue;
        }
        hasMatch = true;

        // Push leading slice
        if (match.index > lastIndex) {
          result.push({ text: text.substring(lastIndex, match.index), html: false });
        }

        // Push wrapped match
        result.push({ text: wrapFn(match[0]), html: true });

        lastIndex = gRegex.lastIndex;
      }

      if (!hasMatch) {
        result.push(seg);
      } else if (lastIndex < text.length) {
        result.push({ text: text.substring(lastIndex), html: false });
      }
    }
    return result;
  }

  // Build the 10 multi-color highlight rows dynamically
  function buildHighlightsPanel() {
    const grid = STATE.shadowRoot.getElementById('highlights-grid');
    if (!grid) return;

    let html = '';
    for (let i = 0; i < 10; i++) {
      const h = STATE.multiHighlights[i] || { text: '', pinned: false };
      const color = MULTI_HIGHLIGHT_COLORS[i];
      const pinClass = h.pinned ? 'highlight-pin-btn active' : 'highlight-pin-btn';

      html += `
        <div class="highlight-row">
          <span class="color-dot" style="background-color: ${color}; color: ${color};"></span>
          <input type="text" class="highlight-input" data-index="${i}" value="${escapeHTML(h.text)}" placeholder="Enter regex pattern (e.g. error\\w*)..." />
          <button class="${pinClass}" data-index="${i}" title="${h.pinned ? 'Pinned (persisted)' : 'Unpinned (session only)'}">📌</button>
        </div>
      `;
    }
    grid.innerHTML = html;

    // Add input listeners
    const inputs = grid.querySelectorAll('.highlight-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const val = e.target.value;
        STATE.multiHighlights[idx].text = val;

        if (STATE.multiHighlights[idx].pinned) {
          saveMultiHighlightsToStorage();
        }
        render();
      });
    });

    // Add pin listeners
    const pins = grid.querySelectorAll('.highlight-pin-btn');
    pins.forEach(pin => {
      pin.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const idx = parseInt(btn.dataset.index, 10);
        STATE.multiHighlights[idx].pinned = !STATE.multiHighlights[idx].pinned;

        if (STATE.multiHighlights[idx].pinned) {
          btn.classList.add('active');
          btn.title = "Pinned (persisted)";
        } else {
          btn.classList.remove('active');
          btn.title = "Unpinned (session only)";
        }

        saveMultiHighlightsToStorage();
      });
    });
  }

  function saveMultiHighlightsToStorage() {
    chrome.storage.local.set({ multiHighlights: STATE.multiHighlights });
  }

})();

