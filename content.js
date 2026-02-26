/* global chrome, ScholarLensUtils */
(function () {
  'use strict';

  const {
    getArxivId,
    escapeHtml,
    authorLabel,
    paperUrl,
    extractTopCiting,
    mergeAuthorPapers,
  } = window.ScholarLensUtils;

  // ── Semantic Scholar API ─────────────────────────────────────────────────

  const SS_BASE = 'https://api.semanticscholar.org/graph/v1';

  // Simple in-page cache (survives only while the tab is open)
  const _cache = {};

  async function apiFetch(url) {
    const resp = await fetch(url);
    if (resp.status === 429) throw new Error('Rate limited by Semantic Scholar. Try again in a minute.');
    if (!resp.ok) throw new Error(`Semantic Scholar API error (${resp.status})`);
    return resp.json();
  }

  async function fetchPaper(arxivId) {
    const fields = 'paperId,title,authors,citationCount,year';
    return apiFetch(`${SS_BASE}/paper/arXiv:${arxivId}?fields=${fields}`);
  }

  async function fetchTopCitingPapers(paperId) {
    const fields = [
      'citingPaper.paperId',
      'citingPaper.title',
      'citingPaper.authors',
      'citingPaper.citationCount',
      'citingPaper.year',
      'citingPaper.externalIds',
    ].join(',');
    const data = await apiFetch(`${SS_BASE}/paper/${paperId}/citations?fields=${fields}&limit=100`);
    return extractTopCiting(data, 5);
  }

  async function fetchTopAuthorPapers(authors, excludePaperId) {
    const authorIds = (authors || []).slice(0, 5).map(a => a.authorId).filter(Boolean);
    if (authorIds.length === 0) return [];

    const fields = 'paperId,title,authors,citationCount,year,externalIds';
    const lists = await Promise.all(
      authorIds.map(id =>
        apiFetch(`${SS_BASE}/author/${id}/papers?fields=${fields}&limit=50`)
          .then(d => d.data || [])
          .catch(() => [])
      )
    );

    return mergeAuthorPapers(lists, excludePaperId, 5);
  }

  // ── Widget HTML ───────────────────────────────────────────────────────────

  function buildWidget() {
    const el = document.createElement('div');
    el.id = 'sl-widget';
    el.innerHTML = `
      <div id="sl-header">
        <svg id="sl-logo" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="11" height="14" rx="1.5" fill="white" fill-opacity="0.3"/>
          <rect x="4" y="5" width="7" height="1.5" rx="0.75" fill="white"/>
          <rect x="4" y="8" width="7" height="1.5" rx="0.75" fill="white"/>
          <rect x="4" y="11" width="4" height="1.5" rx="0.75" fill="white"/>
          <circle cx="14.5" cy="14.5" r="3.5" fill="white" fill-opacity="0.25" stroke="white" stroke-width="1.5"/>
          <line x1="17" y1="17" x2="19" y2="19" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span id="sl-title">Scholar Lens</span>
        <div id="sl-controls">
          <button id="sl-btn-min" title="Minimize">&#8722;</button>
          <button id="sl-btn-close" title="Close">&#215;</button>
        </div>
      </div>
      <div id="sl-body">
        <div id="sl-loading">
          <div class="sl-spinner"></div>
          <span>Looking up paper&hellip;</span>
        </div>
        <div id="sl-error" style="display:none">
          <span id="sl-error-msg"></span>
        </div>
        <div id="sl-content" style="display:none">
          <div id="sl-citation-bar">
            <span id="sl-count">—</span>
            <span class="sl-unit">citations</span>
            <a id="sl-ss-link" href="#" target="_blank" title="View on Semantic Scholar">↗</a>
          </div>

          <div class="sl-section">
            <button class="sl-section-toggle" data-target="sl-citing-list">
              <span class="sl-chevron">▶</span>
              <span class="sl-section-label">Top Citing Papers</span>
              <span class="sl-badge" id="sl-citing-badge"></span>
            </button>
            <ul class="sl-paper-list" id="sl-citing-list" style="display:none"></ul>
          </div>

          <div class="sl-section">
            <button class="sl-section-toggle" data-target="sl-author-list">
              <span class="sl-chevron">▶</span>
              <span class="sl-section-label">More by Authors</span>
              <span class="sl-badge" id="sl-author-badge"></span>
            </button>
            <ul class="sl-paper-list" id="sl-author-list" style="display:none"></ul>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderPaperItem(paper) {
    const li = document.createElement('li');
    li.className = 'sl-paper-item';
    li.innerHTML = `
      <a href="${paperUrl(paper)}" target="_blank">${escapeHtml(paper.title || 'Untitled')}</a>
      <div class="sl-meta">
        <span>${escapeHtml(authorLabel(paper))}</span>
        ${paper.year ? `<span>${paper.year}</span>` : ''}
        ${paper.citationCount != null
          ? `<span class="sl-cites">${paper.citationCount.toLocaleString()} cites</span>`
          : ''}
      </div>
    `;
    return li;
  }

  function setSection(widget, listId, badgeId, papers) {
    const list  = widget.querySelector(`#${listId}`);
    const badge = widget.querySelector(`#${badgeId}`);
    badge.textContent = papers.length;
    list.innerHTML = '';
    if (papers.length === 0) {
      const li = document.createElement('li');
      li.className = 'sl-empty';
      li.textContent = 'None found';
      list.appendChild(li);
    } else {
      papers.forEach(p => list.appendChild(renderPaperItem(p)));
    }
  }

  // ── Widget states ─────────────────────────────────────────────────────────
  // Use style.display directly — the #sl-loading CSS rule has an ID-selector
  // `display: flex` which outranks the browser's `[hidden] { display: none }`,
  // so .hidden toggling doesn't work reliably. Inline styles always win.

  function showLoading(widget) {
    widget.querySelector('#sl-loading').style.display = 'flex';
    widget.querySelector('#sl-error').style.display   = 'none';
    widget.querySelector('#sl-content').style.display = 'none';
  }

  function showError(widget, msg) {
    widget.querySelector('#sl-loading').style.display = 'none';
    widget.querySelector('#sl-error').style.display   = 'block';
    widget.querySelector('#sl-content').style.display = 'none';
    widget.querySelector('#sl-error-msg').textContent = msg;
  }

  function showContent(widget, paper, citations, authorPapers) {
    widget.querySelector('#sl-loading').style.display = 'none';
    widget.querySelector('#sl-error').style.display   = 'none';
    widget.querySelector('#sl-content').style.display = 'block';

    const count = paper.citationCount != null ? paper.citationCount.toLocaleString() : '?';
    widget.querySelector('#sl-count').textContent = count;

    const ssUrl = `https://www.semanticscholar.org/paper/${paper.paperId}`;
    widget.querySelector('#sl-ss-link').href = ssUrl;

    setSection(widget, 'sl-citing-list', 'sl-citing-badge', citations);
    setSection(widget, 'sl-author-list',  'sl-author-badge',  authorPapers);
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  function setupDrag(widget) {
    const header = widget.querySelector('#sl-header');
    let dragging = false, ox = 0, oy = 0;

    header.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      dragging = true;
      const rect = widget.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      widget.style.right  = 'auto';
      widget.style.bottom = 'auto';
      widget.style.left   = `${rect.left}px`;
      widget.style.top    = `${rect.top}px`;
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      widget.style.left = `${e.clientX - ox}px`;
      widget.style.top  = `${e.clientY - oy}px`;
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function setupControls(widget) {
    widget.querySelector('#sl-btn-min').addEventListener('click', () => {
      const body      = widget.querySelector('#sl-body');
      const btn       = widget.querySelector('#sl-btn-min');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? 'block' : 'none';
      btn.innerHTML      = collapsed ? '&#8722;' : '&#43;';
    });

    widget.querySelector('#sl-btn-close').addEventListener('click', () => widget.remove());

    widget.querySelectorAll('.sl-section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const list    = widget.querySelector(`#${btn.dataset.target}`);
        const chevron = btn.querySelector('.sl-chevron');
        const open    = list.style.display !== 'none';
        list.style.display  = open ? 'none' : 'block';
        chevron.textContent = open ? '▶' : '▼';
      });
    });
  }

  // ── Position persistence ──────────────────────────────────────────────────

  function savePosition(widget) {
    try {
      const rect = widget.getBoundingClientRect();
      localStorage.setItem('sl-widget-pos', JSON.stringify({ left: rect.left, top: rect.top }));
    } catch (_) { /* storage unavailable */ }
  }

  function restorePosition(widget) {
    try {
      const saved = JSON.parse(localStorage.getItem('sl-widget-pos') || 'null');
      if (saved) {
        widget.style.right  = 'auto';
        widget.style.bottom = 'auto';
        widget.style.left   = `${Math.max(0, saved.left)}px`;
        widget.style.top    = `${Math.max(0, saved.top)}px`;
      }
    } catch (_) { /* ignore */ }
  }

  // ── Session cache ─────────────────────────────────────────────────────────
  // Persists API results across same-origin navigations (e.g. PDF redirects),
  // so re-injected content scripts skip the loading state entirely.

  function getSessionCache(arxivId) {
    try {
      const raw = sessionStorage.getItem(`sl:${arxivId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setSessionCache(arxivId, data) {
    try {
      sessionStorage.setItem(`sl:${arxivId}`, JSON.stringify(data));
    } catch { /* quota exceeded – ignore */ }
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  // Module-level widget ref so we can re-attach it if the PDF viewer replaces
  // document.body without triggering a full navigation.
  let _activeWidget = null;

  async function init() {
    const arxivId = getArxivId(window.location.href);
    if (!arxivId) return;

    // Guard on <html> dataset instead of getElementById: survives document.body
    // replacement by Chrome's PDF viewer while staying within the same document.
    if (document.documentElement.dataset.slArxivId === arxivId) {
      // Same paper, same document — just re-attach the widget if it was orphaned.
      if (_activeWidget && !_activeWidget.isConnected) {
        (document.body || document.documentElement).appendChild(_activeWidget);
      }
      return;
    }
    document.documentElement.dataset.slArxivId = arxivId;

    // Remove any widget left over from a previous paper in this tab.
    _activeWidget?.remove();

    const widget = buildWidget();
    _activeWidget = widget;
    (document.body || document.documentElement).appendChild(widget);

    setupDrag(widget);
    setupControls(widget);
    restorePosition(widget);
    document.addEventListener('mouseup', () => savePosition(widget));

    // Prefer session cache (survives PDF redirects) then in-memory cache.
    const cached = getSessionCache(arxivId) || _cache[arxivId];
    if (cached) {
      showContent(widget, cached.paper, cached.citations, cached.authorPapers);
      return;
    }

    showLoading(widget);

    try {
      const paper = await fetchPaper(arxivId);
      if (!paper || !paper.paperId) {
        showError(widget, 'Paper not found on Semantic Scholar. It may not be indexed yet.');
        return;
      }

      const [citations, authorPapers] = await Promise.all([
        fetchTopCitingPapers(paper.paperId),
        fetchTopAuthorPapers(paper.authors, paper.paperId),
      ]);

      const result = { paper, citations, authorPapers };
      _cache[arxivId] = result;
      setSessionCache(arxivId, result);
      showContent(widget, paper, citations, authorPapers);
    } catch (err) {
      showError(widget, err.message || 'Unexpected error. Please try reloading.');
    }
  }

  init();
})();
