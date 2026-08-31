import * as vscode from 'vscode';
import { fetchMatches, fetchNews, type MatchSummary, type NewsSummary } from '../services/hltvClient';

export type HLTVViewKind = 'matches' | 'news';

export class HLTVTreeDataProvider implements vscode.TreeDataProvider<HLTVNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HLTVNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: HLTVNode[] = [];

  constructor(private readonly viewKind: HLTVViewKind) {}

  async refresh(): Promise<void> {
    try {
      if (this.viewKind === 'matches') {
        const matches = await fetchMatches();
        this.items = buildMatchNodes(matches);
      } else {
        const news = await fetchNews();
        this.items = buildNewsNodes(news);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load HLTV data.';
      this.items = [
        new HLTVNode('Cloudflare verification required', 'message'),
        new HLTVNode('Open HLTV in a browser and complete the challenge, then refresh.', 'message')
      ];
      void vscode.window.showWarningMessage(message, 'Open HLTV').then((selection) => {
        if (selection === 'Open HLTV') {
          void vscode.env.openExternal(vscode.Uri.parse('https://www.hltv.org/'));
        }
      });
    }

    this._onDidChangeTreeData.fire();
  }

  getChildren(element?: HLTVNode): Thenable<HLTVNode[]> {
    if (!element) {
      return Promise.resolve(this.items);
    }

    return Promise.resolve([]);
  }

  getTreeItem(element: HLTVNode): vscode.TreeItem {
    return element;
  }
}

function buildMatchNodes(matches: MatchSummary[]): HLTVNode[] {
  const groups: Record<string, HLTVNode[]> = {
    past: [],
    live: [],
    upcoming: []
  };

  for (const match of matches) {
    groups[match.phase].push(new HLTVNode(`${match.title} · ${match.metadata}`, 'match'));
  }

  return [
    new HLTVNode('Past matches', 'section'),
    ...groups.past,
    new HLTVNode('Live matches', 'section'),
    ...groups.live,
    new HLTVNode('Upcoming matches', 'section'),
    ...groups.upcoming
  ];
}

function buildNewsNodes(news: NewsSummary[]): HLTVNode[] {
  const groups: Record<'headline' | 'flash', HLTVNode[]> = {
    headline: [],
    flash: []
  };

  for (const item of news) {
    groups[item.level].push(new HLTVNode(`${item.title} · ${item.publishedAt}`, 'news'));
  }

  return [
    new HLTVNode('Headlines', 'section'),
    ...groups.headline,
    new HLTVNode('Flash updates', 'section'),
    ...groups.flash
  ];
}

export class HLTVNode extends vscode.TreeItem {
  constructor(label: string, public readonly kind: 'section' | 'match' | 'news' | 'message') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = kind === 'section' ? 'group' : kind === 'message' ? 'status' : kind;
    this.contextValue = kind;
  }
}
