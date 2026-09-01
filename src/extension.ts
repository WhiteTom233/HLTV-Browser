import * as vscode from 'vscode';
import { HLTVTreeDataProvider } from './providers/HLTVTreeDataProvider';

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

async function refreshAll(matchesProvider: HLTVTreeDataProvider, resultsProvider: HLTVTreeDataProvider, newsProvider: HLTVTreeDataProvider): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Loading',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Loading (Matches)', increment: 0 });
      await matchesProvider.refresh();
      progress.report({ message: 'Loading (Matches)', increment: 25 });

      progress.report({ message: 'Loading (Results)', increment: 0 });
      await resultsProvider.refresh();
      progress.report({ message: 'Loading (Results)', increment: 25 });

      await newsProvider.refresh((message, current, total) => {
        const label = message || `Loading (News ${current} / ${total})`;
        const stepValue = total > 0 ? (50 / total) : 50;
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

  const refreshCommand = vscode.commands.registerCommand('hltv.refresh', async () => {
    await refreshAll(matchesProvider, resultsProvider, newsProvider);
  });

  context.subscriptions.push(matchesView, resultsView, newsView, refreshCommand, copyNewsCommand);
  void refreshAll(matchesProvider, resultsProvider, newsProvider);
}

export function deactivate(): void {
  // no-op
}
