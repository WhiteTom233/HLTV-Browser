import * as vscode from 'vscode';
import { HLTVTreeDataProvider, type HLTVNode } from './providers/HLTVTreeDataProvider';
import { fetchNewsArticle, type NewsSummary } from './services/hltvClient';

function statTableHtml(title: string, detail: Record<string, unknown>, sectionTitle?: string, rows: Array<Record<string, string | number>> = []): string {
  const columns = ['Player', 'Team', 'K-D', 'Swing', 'ADR', 'KAST', 'Rating'];
  const headerCells = columns.map((column) => `<th draggable="true" data-col="${column}">${column}</th>`).join('');
  const payloadRows = rows.length > 0 ? getStatsRows(rows) : [];
  const scoreValue = typeof detail.score === 'string' ? detail.score : 'TBD';
  const liveScore = typeof detail.liveScore === 'string' ? detail.liveScore : ''; 
  const roundHistory = Array.isArray(detail.mapResults)
    ? detail.mapResults.map((mapResult) => {
        const mapName = typeof mapResult?.map === 'string' ? mapResult.map : 'Map';
        const mapScore = typeof mapResult?.score === 'string' ? mapResult.score : 'TBD';
        const summary = typeof mapResult?.summary === 'string' ? mapResult.summary : '';
        return `<li><strong>${mapName}</strong>: ${mapScore}${summary ? ` — ${summary}` : ''}</li>`;
      }).join('')
    : '';
  const killFeed = typeof detail.summary === 'string' && detail.summary.trim()
    ? `<li>${detail.summary.slice(0, 220)}</li>`
    : '<li>No kill feed data available in the current page state.</li>';
  const bodyRows = payloadRows.map((row) => {
    const cells = columns.map((column) => {
      const value = row[column] ?? '';
      return `<td>${value}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); margin: 0; padding: 16px; }
          h2 { margin: 0 0 8px; }
          .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; color: var(--vscode-descriptionForeground); }
          .panel { border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-sideBar-background); padding: 12px; margin-bottom: 16px; }
          .table-wrap { overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
          table { border-collapse: collapse; width: 100%; min-width: 760px; }
          th, td { padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); text-align: left; }
          th { background: var(--vscode-editorWidget-background); cursor: grab; user-select: none; }
          th:active { cursor: grabbing; }
          tbody tr:hover { background: var(--vscode-list-hoverBackground); }
          ul { margin: 0; padding-left: 18px; }
          li { margin: 6px 0; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <div class="meta">
          <span><strong>Score:</strong> ${scoreValue}</span>
          <span><strong>Live:</strong> ${liveScore || '—'}</span>
          <span><strong>Section:</strong> ${sectionTitle || 'Summary'}</span>
        </div>

        <div class="panel">
          <h3>Live scoreboard</h3>
          <ul>${roundHistory || '<li>No round history available on this page.</li>'}</ul>
        </div>

        <div class="panel">
          <h3>Kill feed / live notes</h3>
          <ul>${killFeed}</ul>
        </div>

        <div class="table-wrap">
          <table id="stats-table">
            <thead>
              <tr>${headerCells}</tr>
            </thead>
            <tbody>${bodyRows || '<tr><td colspan="7">No player stats</td></tr>'}</tbody>
          </table>
        </div>
        <script>
          const table = document.getElementById('stats-table');
          if (table) {
            const headerRow = table.querySelector('thead tr');
            const columns = Array.from(headerRow.children);
            let draggedIndex = null;

            columns.forEach((cell, index) => {
              cell.setAttribute('draggable', 'true');
              cell.addEventListener('dragstart', (event) => {
                draggedIndex = index;
                event.dataTransfer.effectAllowed = 'move';
              });
              cell.addEventListener('dragover', (event) => {
                event.preventDefault();
              });
              cell.addEventListener('drop', (event) => {
                event.preventDefault();
                if (draggedIndex === null || draggedIndex === index) {
                  return;
                }

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                const newColumns = Array.from(headerRow.children);
                const [moved] = newColumns.splice(draggedIndex, 1);
                newColumns.splice(index, 0, moved);
                newColumns.forEach((node) => headerRow.appendChild(node));

                rows.forEach((row) => {
                  const cells = Array.from(row.children);
                  const [movedCell] = cells.splice(draggedIndex, 1);
                  cells.splice(index, 0, movedCell);
                  cells.forEach((cell) => row.appendChild(cell));
                });

                draggedIndex = null;
              });
            });
          }
        </script>
      </body>
    </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderArticleHtml(article: NewsSummary): string {
  const title = article.title || 'HLTV News';
  const contentHtml = article.contentHtml && article.contentHtml.trim()
    ? article.contentHtml
    : undefined;
  const contentFallback = article.content ?? 'No article content is available yet.';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          :root { color-scheme: light dark; }
          body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 24px 24px 48px;
            line-height: 1.75;
          }
          .toolbar {
            position: sticky;
            top: 12px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin: 0 0 12px;
            z-index: 10;
          }
          .action-btn {
            appearance: none;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            background: var(--vscode-button-secondaryBackground, var(--vscode-editorWidget-background));
            color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
            padding: 7px 12px;
            font: inherit;
            cursor: pointer;
          }
          .action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
          }
          .header { border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 18px; padding-bottom: 12px; }
          h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
          .meta { color: var(--vscode-descriptionForeground); font-size: 12px; word-break: break-word; }
          .article-body { display: block; }
          .article-body p, .article-body li { margin: 0 0 12px; }
          .article-body .headertext { font-size: 1.03em; font-weight: 600; margin-bottom: 14px; }
          .article-body .news-block { margin: 0 0 12px; }
          .article-body .image-con { margin: 16px 0; }
          .article-body .image { max-width: 100%; border-radius: 8px; display: block; }
          .article-body .imagetext { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 8px; }
          .article-body table { width: 100%; border-collapse: collapse; margin: 18px 0; border: 1px solid var(--vscode-panel-border); }
          .article-body th, .article-body td { border: 1px solid var(--vscode-panel-border); padding: 8px 10px; text-align: left; vertical-align: top; }
          .article-body th { background: var(--vscode-editorWidget-background); }
          .article-body a { color: var(--vscode-textLink-foreground); }
          .article-body .inline-badge { display: inline-block; margin-right: 6px; }
          .article-body h2, .article-body h3, .article-body h4 { margin: 20px 0 10px; }
          .article-body ul, .article-body ol { padding-left: 20px; }
          .article-body img,
          .article-body iframe,
          .article-body video,
          .article-body audio,
          .article-body object,
          .article-body embed,
          .article-body svg,
          .article-body .videoCon,
          .article-body .videoWrapper,
          .article-body .spotify,
          .article-body .twitch,
          .article-body .flag,
          .article-body .newsitem-match-result-team-logo-con img,
          .article-body .newsitem-match-stats-logo {
            display: none !important;
          }
          body.media-enabled .article-body img,
          body.media-enabled .article-body iframe,
          body.media-enabled .article-body video,
          body.media-enabled .article-body audio,
          body.media-enabled .article-body object,
          body.media-enabled .article-body embed,
          body.media-enabled .article-body svg,
          body.media-enabled .article-body .videoCon,
          body.media-enabled .article-body .videoWrapper,
          body.media-enabled .article-body .spotify,
          body.media-enabled .article-body .twitch,
          body.media-enabled .article-body .flag,
          body.media-enabled .article-body .newsitem-match-result-team-logo-con img,
          body.media-enabled .article-body .newsitem-match-stats-logo {
           display: inline-block !important;
          }
          .article-body .hltv-match-card,
          .article-body .newsitem-match-result {
           display: grid;
           grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
           align-items: center;
           width: min(100%, 760px);
           border: 1px solid var(--vscode-panel-border);
           border-radius: 8px;
           background: var(--vscode-editorWidget-background);
           margin: 18px 0;
           overflow: hidden;
          }
          .article-body .match-card-row {
           display: grid;
           grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
           align-items: center;
           width: 100%;
           gap: 12px;
           padding: 10px 16px;
          }
          .article-body .match-card-map-strip {
           grid-column: 1 / -1;
           padding: 0 16px 12px;
           color: var(--vscode-descriptionForeground);
           font-size: 12px;
           letter-spacing: 0.01em;
          }
          .article-body .match-card-map-strip .map-pill {
           display: inline-block;
           margin-right: 8px;
           margin-bottom: 6px;
           padding: 2px 6px;
           border-radius: 999px;
           border: 1px solid var(--vscode-panel-border);
           background: color-mix(in srgb, var(--vscode-editorWidget-background) 90%, var(--vscode-editor-background));
           white-space: nowrap;
          }
          .article-body .schedule-table {
           display: grid;
           gap: 8px;
           margin: 18px 0;
           width: min(100%, 760px);
          }
          .article-body .schedule-row {
           display: grid;
           grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
           align-items: center;
           gap: 12px;
           padding: 10px 16px;
           border: 1px solid var(--vscode-panel-border);
           border-radius: 8px;
           background: var(--vscode-editorWidget-background);
          }
          .article-body .schedule-team {
           font-weight: 600;
           white-space: nowrap;
           overflow: hidden;
           text-overflow: ellipsis;
          }
          .article-body .schedule-team.right { text-align: right; }
          .article-body .schedule-time {
           font-weight: 700;
           text-align: center;
           min-width: 64px;
           color: var(--vscode-textLink-foreground);
          }
          .article-body .newsitem-match-result-top,
          .article-body .newsitem-match-result-middle {
           grid-column: 1 / -1;
           display: flex;
           align-items: center;
           justify-content: space-between;
           gap: 12px;
           padding: 10px 16px;
          }
          .article-body .match-card-team,
          .article-body .match-card-score {
           font-weight: 600;
          }
          .article-body .match-card-score {
           font-weight: 700;
           text-align: center;
           min-width: 72px;
          }
          .article-body .match-card-team.left { text-align: left; }
          .article-body .match-card-team.right { text-align: right; }
          .article-body .newsitem-match-result-top {
           border-bottom: 1px solid var(--vscode-panel-border);
           background: color-mix(in srgb, var(--vscode-editorWidget-background) 80%, var(--vscode-editor-background));
          }
          .article-body .newsitem-match-result-middle {
           padding-top: 14px;
           padding-bottom: 14px;
          }
          .article-body .newsitem-match-result-team-con {
           display: flex;
           align-items: center;
           justify-content: center;
           gap: 8px;
           min-height: 32px;
          }
          .article-body .newsitem-match-result-team-logo-con {
           display: inline-flex;
           align-items: center;
           justify-content: center;
           width: 28px;
           height: 28px;
          }
          .article-body .newsitem-match-result-team-logo-con img {
           width: 26px;
           height: 26px;
           object-fit: contain;
           max-width: 26px;
           max-height: 26px;
          }
          .article-body .newsitem-match-result-team-con:first-child {
           justify-content: flex-start;
          }
          .article-body .newsitem-match-result-team-con:last-child {
           justify-content: flex-end;
          }
          .article-body .newsitem-match-result-team {
           display: inline-flex;
           align-items: center;
           gap: 8px;
           white-space: nowrap;
          }
          .article-body .newsitem-match-result-score-con {
           display: flex;
           flex-direction: column;
           align-items: center;
           justify-content: center;
           min-width: 110px;
          }
          .article-body .newsitem-match-result-score-con > div {
           display: flex;
           align-items: center;
           justify-content: center;
           gap: 8px;
          }
          .article-body .newsitem-match-result-score {
           min-width: 22px;
           text-align: center;
           font-size: 22px;
           font-weight: 700;
           line-height: 1;
          }
          .article-body .scorelost { color: var(--vscode-descriptionForeground); }
          .article-body .scorewon { color: var(--vscode-textLink-foreground); }
          .article-body .newsitem-match-stats-table {
            width: 100%;
            border-collapse: collapse;
            margin: 18px 0;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
          }
          .article-body .newsitem-match-stats-table th,
          .article-body .newsitem-match-stats-table td {
            padding: 8px 10px;
            border: 1px solid var(--vscode-panel-border);
            text-align: left;
          }
          .article-body .newsitem-match-stats-table th {
            background: var(--vscode-editorWidget-background);
            font-weight: 600;
          }
          .article-body .newsitem-match-stats-team {
            min-width: 180px;
          }
          .article-body .newsitem-match-stats-player {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .article-body .newsitem-match-stats-logo,
          .article-body .newsitem-match-result-team-logo-con img,
          .article-body .newsitem-match-result-team-flag-left,
          .article-body .newsitem-match-result-team-flag-right,
          .article-body .flag {
            max-width: 18px;
            max-height: 18px;
            display: none !important;
          }
          body.media-enabled .article-body .newsitem-match-stats-logo,
          body.media-enabled .article-body .newsitem-match-result-team-logo-con img,
          body.media-enabled .article-body .newsitem-match-result-team-flag-left,
          body.media-enabled .article-body .newsitem-match-result-team-flag-right,
          body.media-enabled .article-body .flag {
            display: inline-block !important;
          }
          .empty { color: var(--vscode-descriptionForeground); }
        </style>
      </head>
      <body>
        <div class="toolbar" aria-label="Article actions">
          <button id="toggle-media" type="button" class="action-btn">Load media</button>
          <button id="copy-webview" type="button" class="action-btn">Copy</button>
        </div>
        <div class="header">
          <h1>${escapeHtml(title)}</h1>
          <div class="meta">
            <span>${escapeHtml(article.publishedAt)}</span>
            <span>·</span>
            <a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(article.url)}</a>
          </div>
        </div>
        <div class="article-body">
          ${contentHtml ? contentHtml : `<p>${escapeHtml(contentFallback)}</p>`}
        </div>
        <script>
          const body = document.body;
          const toggleMedia = document.getElementById('toggle-media');
          const copyWebview = document.getElementById('copy-webview');

          function normalizeMatchResultCard(card) {
            const teamLinks = Array.from(card.querySelectorAll('.newsitem-match-result-team a'))
              .map((node) => (node.textContent || '').trim())
              .filter(Boolean);
            const leftName = teamLinks[0] || 'Team A';
            const rightName = teamLinks[1] || 'Team B';
            const scoreBlocks = Array.from(card.querySelectorAll('.newsitem-match-result-score'))
              .map((node) => node.textContent.trim())
              .filter((value) => value !== '' && value !== 'undefined');
            const resultScore = (() => {
              if (scoreBlocks.length >= 2) {
                return scoreBlocks[0] + '-' + scoreBlocks[1];
              }
              return (card.querySelector('.newsitem-match-result-score-con')?.textContent || '').match(/\d+\s*[-:]\s*\d+/)?.[0] || '0-0';
            })();
            const mapScores = Array.from(card.querySelectorAll('.newsitem-match-result-map')).map((mapNode) => {
              const mapName = (mapNode.querySelector('.newsitem-match-result-map-name')?.textContent || '').trim();
              const faded = (mapNode.querySelector('.newsitem-match-result-map-score-faded')?.textContent || '').trim();
              const won = (mapNode.querySelector('.newsitem-match-result-map-score-won')?.textContent || '').trim();
              const lost = (mapNode.querySelector('.newsitem-match-result-map-score-lost')?.textContent || '').trim();
              if (!mapName) {
                return null;
              }
              let scoreText = '';
              if (won && faded) {
                scoreText = faded + '-' + won;
              } else if (won) {
                scoreText = won;
              } else {
                scoreText = (faded || '0') + '-' + (lost || '0');
              }
              return '<span class="map-pill">' + mapName + ' ' + scoreText + '</span>';
            }).filter(Boolean);

            const replacement = document.createElement('div');
            replacement.className = 'hltv-match-card';
            replacement.innerHTML = '<div class="match-card-row"><div class="match-card-team left">' + leftName + '</div><div class="match-card-score">' + resultScore + '</div><div class="match-card-team right">' + rightName + '</div></div>' + (mapScores.length ? '<div class="match-card-map-strip">' + mapScores.join('') + '</div>' : '');
            card.replaceWith(replacement);
          }

          function normalizeScheduleTable(table) {
            const rows = Array.from(table.querySelectorAll('tr.team-row')).map((row) => {
              const teamCell = row.querySelector('.team-center-cell, td') || row;
              const text = (teamCell.textContent || '').replace(/\s+/g, ' ').trim();
              const cleanedText = text.replace(/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*/, '').replace(/\s*(?:Match|Game)$/i, '').trim();
              const match = cleanedText.match(/(.+?)\s*(\d{1,2}:\d{2})\s*(.+)/);
              if (!match) {
                return null;
              }
              const left = match[1].trim().replace(/\s*(?:vs|winner)$/i, '').trim();
              const right = match[3].trim().replace(/\s*(?:winner)$/i, '').trim();
              if (!left || !right) {
                return null;
              }
              return '<div class="schedule-row"><div class="schedule-team left">' + left + '</div><div class="schedule-time">' + match[2] + '</div><div class="schedule-team right">' + right + '</div></div>';
            }).filter(Boolean);

            if (!rows.length) {
              return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'schedule-table';
            wrapper.innerHTML = rows.join('');
            table.replaceWith(wrapper);
          }

          document.querySelectorAll('.newsitem-match-result').forEach((card) => normalizeMatchResultCard(card));
          document.querySelectorAll('.table-container.event-matches-table').forEach((table) => normalizeScheduleTable(table));

          toggleMedia?.addEventListener('click', () => {
            const enabled = body.classList.toggle('media-enabled');
            toggleMedia.textContent = enabled ? 'Hide media' : 'Load media';
          });
          copyWebview?.addEventListener('click', async () => {
            try {
              const html = document.documentElement.outerHTML;
              await navigator.clipboard.writeText(html);
              copyWebview.textContent = 'Copied';
              setTimeout(() => {
                copyWebview.textContent = 'Copy';
              }, 1200);
            } catch (error) {
              const textArea = document.createElement('textarea');
              textArea.value = document.documentElement.outerHTML;
              textArea.style.position = 'fixed';
              textArea.style.opacity = '0';
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              textArea.remove();
              copyWebview.textContent = 'Copied';
              setTimeout(() => {
                copyWebview.textContent = 'Copy';
              }, 1200);
            }
          });
        </script>
      </body>
    </html>
  `;
}

function getNewsCopyText(article: unknown): string {
  if (typeof article === 'string') {
    return article;
  }

  if (article && typeof article === 'object') {
    const candidate = article as { tooltip?: string; content?: string; title?: string; url?: string };
    return candidate.tooltip ?? candidate.content ?? candidate.title ?? '';
  }

  return '';
}

function getStatsRows(playerData: Array<Record<string, string | number>>): Array<Record<string, string | number>> {
  return playerData.map((player) => ({
    Player: player.name ?? player.Player ?? '',
    Team: player.team ?? player.Team ?? '',
    'K-D': player.kd ?? player['K-D'] ?? '',
    Swing: player.roundSwing ?? player.Swing ?? '',
    ADR: player.adr ?? player.ADR ?? '',
    KAST: player.kast ?? player.KAST ?? '',
    Rating: player.rating ?? player.Rating ?? ''
  }));
}

function normalizeDashboardDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  return detail ?? {};
}

function buildDashboardSections(detail: Record<string, unknown>, sectionTitle?: string, players: Array<Record<string, string | number>> = []): Array<{ title: string; rows: Array<Record<string, string | number>> }> {
  const mapResults = Array.isArray(detail.mapResults) ? detail.mapResults : [];
  const sections: Array<{ title: string; rows: Array<Record<string, string | number>> }> = [];

  const primary = sectionTitle && sectionTitle.trim() ? [{ title: sectionTitle, rows: getStatsRows(players) }] : [];
  if (primary.length > 0) {
    sections.push(primary[0]);
  }

  const summaryRows = getStatsRows(players);
  if (summaryRows.length > 0 && !primary.some((item) => item.title.toLowerCase() === 'summary')) {
    sections.push({ title: 'Summary', rows: summaryRows });
  }

  for (const mapResult of mapResults) {
    const mapName = typeof mapResult?.map === 'string' ? mapResult.map : 'Map';
    const mapScore = typeof mapResult?.score === 'string' ? mapResult.score : 'TBD';
    const mapSummary = typeof mapResult?.summary === 'string' ? mapResult.summary : '';
    const title = `${mapName}: ${mapScore}${mapSummary ? ` • ${mapSummary}` : ''}`;
    sections.push({ title, rows: summaryRows });
  }

  if (sections.length === 0) {
    sections.push({ title: 'Live scoreboard', rows: [] });
  }

  return sections;
}

async function refreshAll(matchesProvider: HLTVTreeDataProvider, resultsProvider: HLTVTreeDataProvider, newsProvider: HLTVTreeDataProvider): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Loading',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Matches', increment: 0 });
      await matchesProvider.refresh();
      progress.report({ message: 'Matches (Finished)', increment: 33 });

      progress.report({ message: 'Results', increment: 0 });
      await resultsProvider.refresh();
      progress.report({ message: 'Results (Finished)', increment: 33 });

      await newsProvider.refresh((message, current, total) => {
        const label = message || `Loading (News ${current} / ${total})`;
        const stepValue = total > 0 ? (34 / total) : 34;
        progress.report({
          message: label,
          increment: stepValue
        });
      });
    }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const matchesProvider = new HLTVTreeDataProvider('matches');
  const resultsProvider = new HLTVTreeDataProvider('results');
  const newsProvider = new HLTVTreeDataProvider('news');

  const matchesView = vscode.window.createTreeView('hltv.matches', {
    treeDataProvider: matchesProvider,
    showCollapseAll: true
  });

  const resultsView = vscode.window.createTreeView('hltv.results', {
    treeDataProvider: resultsProvider,
    showCollapseAll: true
  });

  const newsView = vscode.window.createTreeView('hltv.news', {
    treeDataProvider: newsProvider,
    showCollapseAll: true
  });

  const copyNewsCommand = vscode.commands.registerCommand('hltv.copyNewsArticle', async (article?: unknown) => {
    const text = getNewsCopyText(article);
    if (!text) {
      return;
    }

    await vscode.env.clipboard.writeText(text);
    void vscode.window.showInformationMessage('HLTV article copied to clipboard.');
  });

  const openNewsArticleCommand = vscode.commands.registerCommand('hltv.openNewsArticle', async (article?: NewsSummary) => {
    const articleUrl = article?.url ?? '';
    if (!articleUrl) {
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'hltvNewsArticle',
      article?.title ?? 'HLTV News',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading HLTV article',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: `Loading ${article?.title ?? 'article'}…`, increment: 10 });
        try {
          const loaded = await fetchNewsArticle(articleUrl);
          progress.report({ message: 'Rendering article…', increment: 90 });
          panel.webview.html = renderArticleHtml(loaded);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load this article.';
          panel.webview.html = `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 24px;"><h2>${escapeHtml(article?.title ?? 'HLTV News')}</h2><p>${escapeHtml(message)}</p></body></html>`;
        }
      }
    );
  });

  const showStatsTableCommand = vscode.commands.registerCommand('hltv.showMatchStatsTable', async (detail?: Record<string, unknown>, sectionTitle?: string, playerData?: Array<Record<string, string | number>>) => {
    const normalizedDetail = normalizeDashboardDetail(detail);
    const tableTitle = sectionTitle || (typeof normalizedDetail.title === 'string' ? normalizedDetail.title : 'HLTV match stats');
    const rows = getStatsRows(playerData ?? []);
    const panel = vscode.window.createWebviewPanel(
      'hltvMatchStats',
      tableTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );

    panel.webview.html = statTableHtml(tableTitle, normalizedDetail, sectionTitle, rows);
  });

  const refreshCommand = vscode.commands.registerCommand('hltv.refresh', async () => {
    await refreshAll(matchesProvider, resultsProvider, newsProvider);
  });

  context.subscriptions.push(matchesView, resultsView, newsView, refreshCommand, copyNewsCommand, openNewsArticleCommand, showStatsTableCommand);
  void refreshAll(matchesProvider, resultsProvider, newsProvider);
}

export function deactivate(): void {
  // no-op
}
