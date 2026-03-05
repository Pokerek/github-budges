# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension (Manifest V3) that injects review-status badges into GitHub `/pulls` pages. No build system, no dependencies, no API token — just vanilla JavaScript loaded directly by Chrome.

## Installation / Loading the Extension

```
chrome://extensions → Enable Developer mode → Load unpacked → select this folder
```

No build step required. Changes to files take effect after reloading the extension in `chrome://extensions`.

## Architecture

The extension has three runtime entry points:

- **`content.js`** — injected into `github.com/*/pulls*` pages; contains all business logic
- **`popup.html`** — rendered when the user clicks the extension icon; displays a badge legend
- **`manifest.json`** — declares permissions (`https://github.com/*`), content script match pattern, and popup

### Data Flow in `content.js`

```
run()
 └─ processRow(row) [up to 4 concurrent via semaphore]
     ├─ parseAuthor(row)        → string (login from DOM)
     ├─ parseListReview(row)    → { approvals, changesRequested }
     └─ fetchHovercard(url)     → cached fetch of /pull/:id/hovercard
          └─ parseHovercard(doc) → personal review status string
               └─ buildBadges() → DOM elements injected next to PR title
```

Key implementation details:
- **No auth token** — hovercard requests piggyback on the browser's existing GitHub session cookie
- **Request cache** — `fetchHovercard` deduplicates in-flight and completed requests via a `Map`
- **Concurrency limit** — semaphore keeps at most 4 hovercard fetches in flight simultaneously
- **Dynamic pages** — `MutationObserver` + GitHub Turbo/PJAX event listeners re-run `run()` on navigation
- **Loading placeholder** — badge slot shows a pulse animation while the hovercard is fetching

### Badge CSS Classes (in `styles.css`)

`approved`, `approved-full`, `changes`, `needs-review`, `my-pr`, `awaiting`, `loading`

GitHub-themed colors; no external stylesheet dependencies.

## Key Constraints

- Manifest V3 only — do not use `background.js` persistent pages or `executeScript` patterns from MV2
- No npm/bundler — all JS must run as-is in a browser content script context (no `import`/`require`, no TypeScript)
- Selectors in `content.js` target GitHub's live DOM; GitHub's markup changes frequently, so selector robustness matters
