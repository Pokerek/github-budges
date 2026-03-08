(() => {
  'use strict';

  // Current user
  const ME = document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null;

  // Cache: hovercard-url → parsed data
  const cache = new Map();
  let abortController = new AbortController();

  // SVG icons 
  const ICONS = {
    check: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,
    eye: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2C4.686 2 1.562 4.026.168 7.078a1 1 0 000 .844C1.562 10.974 4.686 13 8 13s6.438-2.026 7.832-5.078a1 1 0 000-.844C14.438 4.026 11.314 2 8 2zm0 9a4 4 0 110-8 4 4 0 010 8zm0-6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>`,
    x: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`,
    clock: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4a.75.75 0 01.75.75V8h2.5a.75.75 0 010 1.5H6.5a.75.75 0 01-.75-.75v-4A.75.75 0 017.25 4z"/></svg>`,
    person: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 01-1.498-.07 6.005 6.005 0 013.432-5.142 3.999 3.999 0 115.122 0zM10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>`,
  };

  function makeBadge(cls, icon, text = '') {
    const el = document.createElement('span');
    el.className = `pr-badge pr-badge--${cls}`;
    el.innerHTML = (ICONS[icon] || '') + text;

    return el;
  }

  // Hovercard data

  async function fetchHovercard(url) {
    if (cache.has(url)) return cache.get(url);

    const promise = (async () => {
      try {
        const res = await fetch(url, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          signal: abortController.signal,
        });

        if (!res.ok) return null;

        const html = await res.text();

        return parseHovercard(html);
      } catch (e) {
        if (e.name === 'AbortError') cache.delete(url);

        return null;
      }
    })();

    cache.set(url, promise);
    return promise;
  }

  function parseHovercard(html) {
    const lower = html.toLowerCase();

    if (lower.match(/review\s+required/)) return { required: true };

    let myStatus = null;
    if (lower.includes('pending review request')) myStatus = 'review_requested';
    else if (lower.includes('you approved')) myStatus = 'approved';
    else if (lower.includes('you requested changes')) myStatus = 'changes_requested';

    let approvals = 0;
    let changesRequested = 0;

    if (lower.match(/\S+\s+and\s+\S+\s+approved/)) approvals = 2;
    else if (lower.match(/\S+\s+approved/)) approvals = 1;

    if (lower.match(/\S+\s+and\s+\S+\s+requested\s+changes/)) changesRequested = 2;
    else if (lower.match(/\S+\s+requested\s+changes/)) changesRequested = 1;

    return { myStatus, approvals, changesRequested };
  }


  // Parse PR author

  function parseAuthor(row) {
    return (
      row.querySelector('.opened-by a.Link--muted') ||
      row.querySelector('.opened-by a') ||
      row.querySelector('.text-small a[data-hovercard-type="user"]') ||
      row.querySelector('[class*="opened"] a[data-hovercard-type="user"]')
    )?.textContent?.trim() || null;
  }

  // Build badges

  function buildBadges({ isMyPr, myStatus, approvals, changesRequested, required }) {
    const container = document.createElement('span');
    container.className = 'pr-badge-container';

    if (isMyPr) {
      container.appendChild(makeBadge('my-pr', 'person'));

      if (changesRequested > 0) {
        container.appendChild(makeBadge(
          'changes', 'x',
          `${changesRequested} change${changesRequested !== 1 ? 's' : ''} requested`
        ));
      }

      if (required) {
        container.appendChild(makeBadge('awaiting', 'clock', 'Awaiting review'))
      }
    }

    if (approvals >= 2) {
      container.appendChild(makeBadge('approved-full', 'check', 'Approved'));
    }

    if (myStatus === 'review_requested') {
      container.appendChild(makeBadge('needs-review', 'eye', 'Review requested'));
    }
    if (!isMyPr && myStatus === 'approved') {
      container.appendChild(makeBadge('approved', 'check', 'Approved by you'));
    }

    if (myStatus !== 'approved' && approvals > 0 && approvals < 2) {
      container.appendChild(makeBadge('approved', 'check', `${approvals} approval${approvals !== 1 ? 's' : ''}`));
    }

    return container.children.length ? container : null;
  }

  // Process a single row

  function makeLoadingPlaceholder() {
    const el = document.createElement('span');
    el.className = 'pr-badge-container';
    el.appendChild(makeBadge('loading', '', '···'));
    return el;
  }

  async function processRow(row) {
    if (row.dataset.ghBadgeDone) return;
    row.dataset.ghBadgeDone = '1';

    const titleLink = row.querySelector('a.js-navigation-open[href*="/pull/"]');
    if (!titleLink) return;

    const author = parseAuthor(row);
    const isMyPr = ME && author && author.toLowerCase() === ME.toLowerCase();

    const placeholder = makeLoadingPlaceholder();
    titleLink.insertAdjacentElement('afterend', placeholder);

    const hovercardUrl = titleLink.getAttribute('data-hovercard-url') ||
      titleLink.href.replace('https://github.com', '') + '/hovercard';
    const hoverCardData = await fetchHovercard(hovercardUrl);

    const badges = buildBadges({
      isMyPr,
      myStatus: hoverCardData?.myStatus || null,
      approvals: hoverCardData?.approvals || 0,
      changesRequested: hoverCardData?.changesRequested || 0,
      required: hoverCardData?.required || false,
    });

    if (badges) {
      placeholder.replaceWith(badges);

      return;
    }

    placeholder.remove();
    row.dataset.ghBadgeDone = '';
  }

  function findRows() {
    return [...new Set(
      [...document.querySelectorAll('a.js-navigation-open[href*="/pull/"]')]
        .map(a => a.closest('.d-flex.Box-row--drag-hide, li[data-id], li.js-issue-row'))
        .filter(Boolean)
    )];
  }

  const CONCURRENCY = 4;

  async function run() {
    const rows = findRows().filter(r => !r.dataset.ghBadgeDone);

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.allSettled(rows.slice(i, i + CONCURRENCY).map(processRow));
    }
  }

  function isPrListPage() {
    return /\/pulls(\?|$|#)|^\/pulls$/.test(location.href);
  }

  function onNavigate() {
    abortController.abort();
    abortController = new AbortController();
    cache.clear();
    if (isPrListPage()) run();
  }

  if (isPrListPage()) {
    run();
  }

  let timer;
  new MutationObserver(mutations => {
    if (!isPrListPage()) return;

    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {

        if (node.nodeType !== 1) continue;

        if (node.querySelector('a[href*="/pull/"]') !== null ||
          node.matches('a[href*="/pull/"]')) {
          clearTimeout(timer);
          timer = setTimeout(run, 400);
          return;
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('turbo:render', onNavigate);
  document.addEventListener('pjax:end', onNavigate);

  window.addEventListener('pageshow', e => {
    if (e.persisted && isPrListPage()) onNavigate();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPrListPage()) run();
  });
})();
