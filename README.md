# GitHub PR Review Badges

A Chrome extension that adds visual review-status badges to GitHub pull request list pages — no API token required.

## What it does

On any GitHub `/pulls` page the extension injects small badges next to each PR title so you can see what needs your attention at a glance.

| Badge | Meaning |
|---|---|
| `My PR` | The PR was opened by you |
| `Awaiting review` | Your PR has no reviews yet |
| `N approvals` | Your PR has received N approvals |
| `N changes requested` | Someone blocked your PR |
| `Review requested` | You were asked to review this PR |
| `Approved by you` | You already approved this PR |
| `Changes requested by you` | You requested changes on this PR |

## How it works

- **Author detection** — reads the "opened by" link directly from the page DOM.
- **Aggregate review status** — parses the `aria-label` on GitHub's built-in review badge (e.g. "2 review approvals", "1 review requesting changes").
- **Personal review status** — fetches GitHub's native hovercard for each PR (`/pull/:id/hovercard`) using your existing browser session. The hovercard contains text like *"You have a pending review request"* or *"You approved this pull request"*, which is used to show the right badge.

No GitHub API token. No data leaves your browser. Everything is read from HTML GitHub already renders.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `github-badge` folder.
5. Navigate to any `github.com/*/pulls` page — badges appear automatically.
