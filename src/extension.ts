import * as vscode from 'vscode';
import { HLTVTreeDataProvider } from './providers/HLTVTreeDataProvider';

export function activate(context: vscode.ExtensionContext): void {
  const matchesProvider = new HLTVTreeDataProvider('matches');
  const newsProvider = new HLTVTreeDataProvider('news');

  const matchesView = vscode.window.createTreeView('hltv.matches', {
    treeDataProvider: matchesProvider,
    showCollapseAll: true
  });

  const newsView = vscode.window.createTreeView('hltv.news', {
    treeDataProvider: newsProvider,
    showCollapseAll: true
  });

  const refreshCommand = vscode.commands.registerCommand('hltv.refresh', async () => {
    await Promise.all([matchesProvider.refresh(), newsProvider.refresh()]);
  });

  context.subscriptions.push(matchesView, newsView, refreshCommand);
  void matchesProvider.refresh();
  void newsProvider.refresh();
}

export function deactivate(): void {
  // no-op for now
}
