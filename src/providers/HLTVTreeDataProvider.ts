import * as vscode from 'vscode';
import { fetchMatches, fetchNews, type MatchSummary, type NewsSummary } from '../services/hltvClient';

export type HLTVViewKind = 'matches' | 'news';

export class HLTVTreeDataProvider implements vscode.TreeDataProvider<HLTVNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HLTVNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: HLTVNode[] = [];

  constructor(private readonly viewKind: HLTVViewKind) {}

  async refresh(progress?: (message: string, current: number, total: number) => void): Promise<void> {
    try {
      if (this.viewKind === 'matches') {
        const matches = await fetchMatches(progress);
        this.items = buildMatchNodes(matches);
      } else {
        const news = await fetchNews(progress);
        this.items = buildNewsNodes(news);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load HLTV data.';
      this.items = this.viewKind === 'matches'
        ? [new HLTVNode(`Matches unavailable: ${message}`, 'message')]
        : [new HLTVNode(`News unavailable: ${message}`, 'message')];
      void vscode.window.showWarningMessage(message);
    }

    this._onDidChangeTreeData.fire();
  }

  getChildren(element?: HLTVNode): Thenable<HLTVNode[]> {
    if (!element) {
      return Promise.resolve(this.items);
    }

    return Promise.resolve(element.children ?? []);
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
    const node = new HLTVNode(
      `${match.teams?.[0] ?? 'Team A'} vs ${match.teams?.[1] ?? 'Team B'} · ${match.format ?? 'Bo3'} · ${match.event ?? 'HLTV Event'}`,
      'match'
    );
    node.description = match.phase;
    node.tooltip = [
      `Teams: ${match.teams?.join(' vs ') ?? 'TBD'}`,
      `Format: ${match.format ?? 'Bo3'}`,
      `Event: ${match.event ?? 'HLTV Event'}`,
      `Score: ${match.score ?? 'TBD'}`,
      `Date: ${match.date ?? 'Unknown time'}`
    ].join('\n');
    const openMatchNode = new HLTVNode('Open match page', 'link');
    openMatchNode.command = {
      command: 'vscode.open',
      title: 'Open HLTV Match',
      arguments: [vscode.Uri.parse(match.url)]
    };

    node.children = [
      new HLTVNode(`Teams: ${match.teams?.join(' vs ') ?? 'TBD'}`, 'detail'),
      new HLTVNode(`Format: ${match.format ?? 'Bo3'}`, 'detail'),
      new HLTVNode(`Event: ${match.event ?? 'HLTV Event'}`, 'detail'),
      new HLTVNode(`Date: ${match.date ?? 'Unknown time'}`, 'detail'),
      new HLTVNode(`Score: ${match.score ?? 'TBD'}`, 'detail'),
      openMatchNode
    ];
    node.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    groups[match.phase].push(node);
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
    const articleNode = new HLTVNode(`${item.title} · ${item.publishedAt}`, 'news');
    articleNode.tooltip = item.content ?? item.title;
    articleNode.command = {
      command: 'vscode.open',
      title: 'Open HLTV article',
      arguments: [vscode.Uri.parse(item.url)]
    };
    articleNode.collapsibleState = vscode.TreeItemCollapsibleState.None;
    groups[item.level].push(articleNode);
  }

  return [
    new HLTVNode('Headlines', 'section'),
    ...groups.headline,
    new HLTVNode('Flash updates', 'section'),
    ...groups.flash
  ];
}

export class HLTVNode extends vscode.TreeItem {
  children?: HLTVNode[];

  constructor(label: string, public readonly kind: 'section' | 'match' | 'news' | 'detail' | 'link' | 'message') {
    super(label, kind === 'section' || kind === 'match' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = kind === 'section' ? 'group' : kind === 'message' ? 'status' : kind === 'detail' ? 'detail' : kind === 'link' ? 'open' : 'match';
    this.contextValue = kind;
  }
}
