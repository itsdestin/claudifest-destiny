/**
 * mockup-render.js — Client-side expander for theme concept mockups.
 *
 * Problem this solves: before this existed, every concept card had to
 * verbatim-include ~1 KB of canonical chrome HTML (gear SVG, session
 * pill, view toggle, paperclip + compass + send-arrow SVGs, model /
 * permission / usage chips). Three concepts = ~3 KB duplicated. This
 * file centralizes that chrome as a template string and exposes a
 * single `expandMockups()` call that scans the page for `.app-mockup`
 * elements carrying `data-mockup` and injects the chrome, filling
 * placeholders from the element's data-* attributes.
 *
 * Concept authors now write tiny cards: scoping CSS vars, data-*-style
 * layout presets, glass vars inline, and the data attributes below.
 * This file renders the rest.
 *
 * Data attributes read from each `[data-mockup]` element:
 *   data-wallpaper     optional — /files/... URL. If missing, no bg layer.
 *   data-session       session pill label (default: "main")
 *   data-session-color green | red | blue | gray (default: green)
 *   data-model         model chip label (default: "Opus 1M")
 *   data-permission    permission chip label (default: "NORMAL")
 *   data-usage         5h usage percent number (default: 23)
 *   data-asst1         first assistant bubble text
 *   data-user          user bubble text
 *   data-asst2         second assistant bubble text
 *   data-tool-card     optional tool-card label (inside asst2)
 *   data-fx            space-separated effects: "vignette noise scanlines"
 *
 * All data-* values are treated as plain text (textContent), not HTML —
 * safe against any content Claude generates.
 */
(function () {
  if (typeof document === 'undefined') return;

  const SVG = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5 L20 5 A2 2 0 0 1 22 7 L22 15 A2 2 0 0 1 20 17 L10 17 L6 20 L7 17 L4 17 A2 2 0 0 1 2 15 L2 7 A2 2 0 0 1 4 5 Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 11 L8.5 11.01" stroke-width="2.5" stroke-linecap="round"/><path d="M12 11 L12 11.01" stroke-width="2.5" stroke-linecap="round"/><path d="M15.5 11 L15.5 11.01" stroke-width="2.5" stroke-linecap="round"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4 L20 4 A2 2 0 0 1 22 6 L22 18 A2 2 0 0 1 20 20 L4 20 A2 2 0 0 1 2 18 L2 6 A2 2 0 0 1 4 4 Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 9 L10 12 L6 15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15 L17 15" stroke-width="2" stroke-linecap="round"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15.5 6 L15.5 15.5 A3.5 3.5 0 0 1 8.5 15.5 L8.5 7 A2 2 0 0 1 12.5 7 L12.5 15.5 A0.5 0.5 0 0 1 11.5 15.5 L11.5 8.5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="1.8"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" opacity="0.3"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
    sendArrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>',
  };

  /** Escape text for safe insertion into HTML (not strictly needed since
   *  we'll set textContent afterward, but used for placeholder assembly). */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderChrome(d) {
    const wallpaper = d.wallpaper ? `<div id="theme-bg" style="background-image: url('${esc(d.wallpaper)}');"></div>` : '';
    const sessionColor = ['green', 'red', 'blue', 'gray'].includes(d.sessionColor) ? d.sessionColor : 'green';
    const fx = (d.fx || '').split(/\s+/).filter(Boolean);
    const effectsHtml = fx.map((f) => {
      if (f === 'vignette')  return '<div class="effect-vignette"></div>';
      if (f === 'noise')     return '<div class="effect-noise"></div>';
      if (f === 'scanlines') return '<div class="effect-scanlines"></div>';
      return '';
    }).join('');
    const toolCard = d.toolCard ? `<div class="tool-card">● ${esc(d.toolCard)}</div>` : '';

    return `
      ${wallpaper}
      <div class="header-bar">
        <button class="header-btn" aria-label="Settings">${SVG.gear}</button>
        <div class="session-strip">
          <button class="session-pill active">
            <span class="session-dot ${sessionColor}"></span>
            <span class="session-name">${esc(d.session || 'main')}</span>
          </button>
          <button class="session-strip-menu" aria-label="All sessions">${SVG.chevronDown}</button>
        </div>
        <div class="view-toggle" style="margin-left:auto;">
          <button class="view-toggle-btn active">${SVG.chat}<span>Chat</span></button>
          <button class="view-toggle-btn">${SVG.terminal}</button>
        </div>
      </div>
      <div class="chat-area">
        <div class="assistant-bubble">${esc(d.asst1 || 'Hello! How can I help you today?')}</div>
        <div class="user-bubble">${esc(d.user || 'Show me what you can do.')}</div>
        <div class="assistant-bubble">${esc(d.asst2 || 'Sure — let me walk you through it.')}${toolCard}</div>
      </div>
      <div class="input-bar-container">
        <div class="input-form">
          <button class="input-icon-btn" aria-label="Attach">${SVG.attach}</button>
          <button class="input-icon-btn" aria-label="Skills">${SVG.compass}</button>
          <input class="input-field" placeholder="Message Claude…" readonly>
          <button class="send-btn" aria-label="Send">${SVG.sendArrow}</button>
        </div>
      </div>
      <div class="status-bar">
        <button class="status-chip chip-model">${esc(d.model || 'Opus 1M')}</button>
        <button class="status-chip chip-perm">${esc(d.permission || 'NORMAL')}</button>
        <button class="status-chip chip-usage" style="margin-left:auto;"><span>5h:</span><span class="chip-usage-pct">${esc(d.usage || '23')}%</span></button>
      </div>
      ${effectsHtml}
    `;
  }

  function expandMockups(root) {
    const scope = root || document;
    const targets = scope.querySelectorAll('.app-mockup[data-mockup]');
    targets.forEach((el) => {
      if (el.dataset.mockupExpanded === '1') return; // idempotent
      const d = {
        wallpaper:    el.dataset.wallpaper,
        session:      el.dataset.session,
        sessionColor: el.dataset.sessionColor,
        model:        el.dataset.model,
        permission:   el.dataset.permission,
        usage:        el.dataset.usage,
        asst1:        el.dataset.asst1,
        user:         el.dataset.user,
        asst2:        el.dataset.asst2,
        toolCard:     el.dataset.toolCard,
        fx:           el.dataset.fx,
      };
      el.innerHTML = renderChrome(d);
      el.dataset.mockupExpanded = '1';
    });
  }

  // Expose + auto-run on DOMContentLoaded.
  window.mockupRender = { expandMockups, SVG };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => expandMockups());
  } else {
    expandMockups();
  }
})();
