(() => {
  'use strict';

  // ── Current user ──────────────────────────────────────────────────────────────
  const ME = document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null;

  // ── Cache: hovercard-url → parsed data ───────────────────────────────────────
  const cache = new Map();

  // ── SVG icons ─────────────────────────────────────────────────────────────────
  const ICONS = {
    check:  `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,
    eye:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2C4.686 2 1.562 4.026.168 7.078a1 1 0 000 .844C1.562 10.974 4.686 13 8 13s6.438-2.026 7.832-5.078a1 1 0 000-.844C14.438 4.026 11.314 2 8 2zm0 9a4 4 0 110-8 4 4 0 010 8zm0-6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>`,
    x:      `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`,
    clock:  `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4a.75.75 0 01.75.75V8h2.5a.75.75 0 010 1.5H6.5a.75.75 0 01-.75-.75v-4A.75.75 0 017.25 4z"/></svg>`,
    person: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 01-1.498-.07 6.005 6.005 0 013.432-5.142 3.999 3.999 0 115.122 0zM10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>`,
  };

  function makeBadge(cls, icon, text, title) {
    const el = document.createElement('span');
    el.className = `pr-badge pr-badge--${cls}`;
    el.innerHTML = (ICONS[icon] || '') + text;
    if (title) el.title = title;
    return el;
  }

  // ── Fetch + parse hovercard ───────────────────────────────────────────────────
  //
  // The hovercard is served at the same origin (github.com) using session cookies,
  // so no token is needed. It contains a <span class="lh-condensed"> with text like:
  //   "You have a pending review request"
  //   "You approved this pull request"
  //   "You requested changes to this pull request"

  async function fetchHovercard(url) {
    if (cache.has(url)) return cache.get(url);

    // Store a promise immediately to avoid duplicate in-flight requests
    const promise = (async () => {
      try {
        const res = await fetch(url, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
        });
        if (!res.ok) return null;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return parseHovercard(doc);
      } catch {
        return null;
      }
    })();

    cache.set(url, promise);
    return promise;
  }

  function parseHovercard(doc) {
    // Personal review status — sits inside the last .border-top section
    const statusText = [...doc.querySelectorAll('span.lh-condensed')]
      .map(el => el.textContent.trim().toLowerCase())
      .find(t => t.includes('you ') || t.includes('pending'));

    let myStatus = null; // 'review_requested' | 'approved' | 'changes_requested' | 'commented'
    if (statusText) {
      if (statusText.includes('pending review request'))        myStatus = 'review_requested';
      else if (statusText.includes('approved'))                 myStatus = 'approved';
      else if (statusText.includes('requested changes'))        myStatus = 'changes_requested';
      else if (statusText.includes('commented'))                myStatus = 'commented';
    }

    return { myStatus };
  }

  // ── Parse list-view aggregate review badge ────────────────────────────────────
  //
  // Selector confirmed from DOM inspection:
  //   span.d-none.d-md-inline-flex > span.d-inline-block.ml-1 > a[aria-label]
  //
  // aria-label patterns:
  //   "Review required before merging"
  //   "N review approvals" / "N approving reviews"
  //   "N review requesting changes" / "N reviews requesting changes"

  function parseListReview(row) {
    const badge = row.querySelector(
      'span.d-none.d-md-inline-flex a[aria-label], span.d-inline-block.ml-1 a[aria-label]'
    );
    if (!badge) return { type: 'none' };

    const label = (badge.getAttribute('aria-label') || '').toLowerCase();

    const approvalMatch = label.match(/(\d+)\s+(review\s+approvals?|approving\s+reviews?)/);
    if (approvalMatch) return { type: 'approved', count: parseInt(approvalMatch[1], 10) };

    const changesMatch = label.match(/(\d+)\s+reviews?\s+requesting\s+changes?/);
    if (changesMatch) return { type: 'changes', count: parseInt(changesMatch[1], 10) };

    if (label.includes('review required')) return { type: 'required' };

    return { type: 'none' };
  }

  // ── Parse PR author ───────────────────────────────────────────────────────────

  function parseAuthor(row) {
    return row.querySelector('.opened-by a.Link--muted')?.textContent?.trim() || null;
  }

  // ── Build badges ──────────────────────────────────────────────────────────────

  function buildBadges({ isMyPr, listReview, myStatus }) {
    const container = document.createElement('span');
    container.className = 'pr-badge-container';

    if (isMyPr) {
      container.appendChild(makeBadge('my-pr', 'person', 'My PR'));

      if (listReview.type === 'approved') {
        container.appendChild(makeBadge(
          'approved-full', 'check',
          `${listReview.count} approval${listReview.count !== 1 ? 's' : ''}`
        ));
      } else if (listReview.type === 'changes') {
        container.appendChild(makeBadge(
          'changes', 'x',
          `${listReview.count} change${listReview.count !== 1 ? 's' : ''} requested`
        ));
      } else if (listReview.type === 'required') {
        container.appendChild(makeBadge('awaiting', 'clock', 'Awaiting review'));
      }

    } else {
      // Personal status from hovercard (most specific — shown first)
      if (myStatus === 'review_requested') {
        container.appendChild(makeBadge('needs-review', 'eye', 'Review requested', 'You have a pending review request'));
      } else if (myStatus === 'approved') {
        container.appendChild(makeBadge('approved', 'check', 'Approved by you'));
      } else if (myStatus === 'changes_requested') {
        container.appendChild(makeBadge('changes', 'x', 'Changes requested by you'));
      }

      // Aggregate counts from list view
      if (listReview.type === 'approved') {
        container.appendChild(makeBadge(
          'approved', 'check',
          `${listReview.count} approval${listReview.count !== 1 ? 's' : ''}`
        ));
      } else if (listReview.type === 'changes') {
        container.appendChild(makeBadge(
          'changes', 'x',
          `${listReview.count} change${listReview.count !== 1 ? 's' : ''} requested`
        ));
      } else if (listReview.type === 'required' && !myStatus) {
        // Only show generic "Needs review" if we have no personal status
        container.appendChild(makeBadge('needs-review', 'eye', 'Needs review'));
      }
    }

    return container.children.length ? container : null;
  }

  // ── Process a single row ──────────────────────────────────────────────────────

  async function processRow(row) {
    if (row.dataset.ghBadgeDone) return;
    row.dataset.ghBadgeDone = '1';

    const titleLink = row.querySelector('a.js-navigation-open[href*="/pull/"]');
    if (!titleLink) return;

    const author      = parseAuthor(row);
    const isMyPr      = ME && author && author.toLowerCase() === ME.toLowerCase();
    const listReview  = parseListReview(row);

    // Insert a loading placeholder immediately
    const placeholder = document.createElement('span');
    placeholder.className = 'pr-badge-container';
    placeholder.appendChild(makeBadge('loading', '', '···'));
    titleLink.insertAdjacentElement('afterend', placeholder);

    // Fetch hovercard for personal review status (skip for own PRs — hovercard won't say "you requested")
    let myStatus = null;
    if (!isMyPr) {
      const hovercardUrl = titleLink.getAttribute('data-hovercard-url') ||
        titleLink.href.replace('https://github.com', '') + '/hovercard';
      const hc = await fetchHovercard(hovercardUrl);
      myStatus = hc?.myStatus || null;
    }

    const badges = buildBadges({ isMyPr, listReview, myStatus });
    if (badges) {
      placeholder.replaceWith(badges);
    } else {
      placeholder.remove();
      row.dataset.ghBadgeDone = ''; // allow retry if nothing rendered
    }
  }

  // ── Find rows + run ───────────────────────────────────────────────────────────

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
    // Process in small batches to avoid flooding requests
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.allSettled(rows.slice(i, i + CONCURRENCY).map(processRow));
    }
  }

  function isPrListPage() {
    return /\/pulls(\?|$|#)|^\/pulls$/.test(location.href);
  }

  if (isPrListPage()) {
    run();

    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('turbo:render', run);
    document.addEventListener('pjax:end', run);
  }
})();
