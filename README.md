# HLTV Browser VS Code Extension

## Overview

This extension fetches HLTV match, result, and news data and presents it in a compact, text-first VS Code tree + Webview experience. The current implementation is designed around three sidebar views:

- Matches
- Results
- News

The extension is intentionally lightweight and editor-centric: it favors plain text nodes, Webviews, and structured detail panels over loading raw HLTV pages directly in-browser.

## Current feature set

- Match list grouped by phase:
  - live
  - upcoming
  - past
- Results list for finished matches, reusing the same match detail rendering flow as the regular matches view.
- Match detail expansion with:
  - teams, format, event, date/time
  - match score and live score
  - per-map results
  - player stats grouped by Summary / Map sections
- Stats view in a table/Webview form with sortable/draggable columns.
- Dedicated News article panes with:
  - loading progress notification
  - structured article extraction from HLTV
  - optional media toggle
  - copy current Webview HTML to clipboard
- Automatic Cloudflare fallback detection and user-facing error messaging.

## Project architecture

### 1. Extension entry: `src/extension.ts`

This file is the VS Code host integration layer.

Responsibilities:

- creates the three tree views: `hltv.matches`, `hltv.results`, `hltv.news`
- registers commands:
  - `hltv.refresh`
  - `hltv.openNewsArticle`
  - `hltv.showMatchStatsTable`
  - `hltv.copyNewsArticle`
- starts the initial refresh cycle when the extension activates
- renders HTML for match-stat tables and news article Webviews
- provides the UI for toggling embedded media and copying the rendered article source

Key concepts in this file:

- `activate(context)` sets up providers and commands
- `refreshAll(...)` fetches Matches, Results, and News in one progress workflow
- `renderArticleHtml(...)` sanitizes HLTV article content and renders it in a VS Code-styled panel
- `statTableHtml(...)` renders per-map/per-summary player stats as a table with draggable columns

### 2. Tree provider: `src/providers/HLTVTreeDataProvider.ts`

This file transforms fetched data into VS Code `TreeItem` nodes.

Responsibilities:

- fetches `MatchSummary[]` / `NewsSummary[]` from the scraper layer
- groups nodes into matching sections and phases
- lazy-loads match details when a match node is expanded
- builds command-driven nodes for:
  - summary match stats
  - map-specific stats
  - open match page
  - open news article

Important behavior:

- `buildMatchNodes()` creates match nodes with phase labels and tooltip metadata
- `getChildren(element)` fetches detailed match information on demand
- `buildMatchDetailNodes(...)` creates section nodes like `Summary: 2-1`, `Anubis: 13-8`, etc.
- `buildNewsNodes()` creates click-to-open article list items

### 3. HLTV scraper: `src/services/hltvClient.ts`

This is the data extraction layer.

Responsibilities:

- launches a headless Playwright browser
- visits HLTV pages with a browser context adapted for HLTV access
- detects Cloudflare interstitials before continuing
- extracts:
  - match lists
  - recent results
  - live match details
  - map results and scoreboard metadata
  - player stats for Summary / individual maps
  - article title, metadata, sanitized article body

Data contracts defined here include:

- `MatchSummary`
- `MatchDetail`
- `MatchMapResult`
- `MatchPlayerStat`
- `NewsSummary`

This module also contains the normalization logic that handles:

- team name parsing from HLTV match links
- result-card reconstruction for article pages
- local time conversion for match dates
- scoreboard and live-map detection fallbacks
- article content filtering to remove junk blocks and preserve the real article structure

## Request flow / runtime behavior

1. VS Code activates the extension.
2. `activate()` creates three providers and binds refresh + detail commands.
3. `refreshAll()` loads Match, Results, and News data concurrently in a user-visible progress workflow.
4. The tree renders match/news items.
5. When a user expands a match node, `fetchMatchDetail()` loads that page and extracts:
   - team names
   - score
   - map results
   - per-section player stats
6. Clicking a match detail node opens a stat table Webview.
7. Clicking a News item opens a dedicated article Webview panel.
8. The article panel shows sanitized HLTV content, hides media by default, and exposes a toolbar with:
   - Load media
   - Copy

## Important files

- `package.json` — extension manifest, commands, views, and scripts
- `src/extension.ts` — VS Code extension entry and Webview rendering
- `src/providers/HLTVTreeDataProvider.ts` — tree data provider + lazy detail loading
- `src/services/hltvClient.ts` — Playwright / HLTV scraping and normalization
- `resources/` — extension branding assets

## Development setup

### Install dependencies

```bash
npm install
```

### Compile the extension

```bash
npm run compile
```

### Run in VS Code

Press `F5` in the VS Code extension host to launch the extension in a development window.

## Notes for maintainers

- The scraper is intentionally resilient to HLTV DOM drift. Match and news parsing uses a mix of selectors and heuristics to handle the site’s many layouts.
- New HLTV pages may require targeted selector adjustments, especially for live pages and special article templates.
- This project intentionally avoids rendering the full HLTV page in the editor; all display is via structured text and Webviews to keep the extension readable and low-friction.
- Media is hidden by default in article pages to prevent noisy images or embedded widgets from cluttering the interface.

## Typical commands

```bash
npm install
npm run compile
```

The extension can then be run with the VS Code debug launcher or by opening the project in the Extension Development Host.

