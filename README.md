# Scholar Lens for arXiv

A Chrome extension that overlays citation stats from [Semantic Scholar](https://www.semanticscholar.org/) on any arXiv paper page — without leaving the tab.

## Features

- **Citation count** — shows how many times the paper has been cited
- **Top citing papers** — the most-cited papers that reference this one
- **More by authors** — the authors' other most-cited works
- **Draggable widget** — position it anywhere; position is saved across sessions
- **Minimise / close** — collapse the widget or dismiss it entirely
- **Session cache** — results are cached so navigating between `/abs`, `/html`, and `/pdf` views of the same paper doesn't re-fetch

Works on `arxiv.org/abs/*`, `arxiv.org/html/*`, and `arxiv.org/pdf/*`.

## Installation

### From the Chrome Web Store

*(Coming soon)*

### Load unpacked (developer mode)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the repository folder.
5. Open any arXiv paper — the widget appears in the bottom-right corner.

## How it works

When you open an arXiv paper page the extension:

1. Parses the arXiv ID from the URL.
2. Calls the [Semantic Scholar Graph API](https://api.semanticscholar.org/api-docs/graph) to fetch paper metadata (title, authors, citation count).
3. In parallel, fetches the top 100 citing papers and the top 50 papers for each of the first 5 authors.
4. Renders the results in a floating widget.

No API key is required. The Semantic Scholar public API is used under its free tier.

## Project structure

```
scholar_extension/
├── manifest.json        # MV3 extension manifest
├── content.js           # Widget logic injected into arXiv pages
├── utils.js             # Pure utility functions (UMD — works in browser and Node)
├── styles.css           # Widget styles (all selectors prefixed with sl-)
├── background.js        # Minimal MV3 service worker
├── icons/
│   ├── icon{16,32,48,128}.png
│   └── generate_icons.py
├── tests/
│   └── utils.test.js    # Jest unit tests (41 tests, 100% coverage)
├── jest.config.js
└── package.json
```

## Development

### Prerequisites

- Node.js (tested with Node 25 via Homebrew)

### Install dev dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

All 41 tests pass with 100% statement/line coverage on `utils.js`.

### Regenerate icons

```bash
python3 icons/generate_icons.py
```

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Save widget position across sessions |
| `host_permissions: arxiv.org` | Inject the content script |
| `host_permissions: api.semanticscholar.org` | Fetch citation data directly from the page |

No data is sent to any server other than Semantic Scholar's public API.
