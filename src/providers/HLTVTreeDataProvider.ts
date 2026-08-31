import * as vscode from 'vscode';
import { fetchMatchDetail, fetchMatches, fetchNews, type MatchSummary, type NewsSummary } from '../services/hltvClient';

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

  async getChildren(element?: HLTVNode): Promise<HLTVNode[]> {
    if (!element) {
      return this.items;
    }

    if (element.kind === 'match') {
      if (element.children && element.children.length > 0) {
        return element.children;
      }

      const matchUrl = element.matchUrl;
      if (!matchUrl) {
        return element.children ?? [];
      }

      try {
        const detail = await fetchMatchDetail(matchUrl);
        element.children = buildMatchDetailNodes(detail, element.label as string, matchUrl);
        return element.children;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load match details.';
        element.children = [new HLTVNode(`Match detail unavailable: ${message}`, 'detail')];
        return element.children;
      }
    }

    return element.children ?? [];
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
    const phase = match.phase ?? 'upcoming';
    const prefix = phase === 'live' ? '[LIVE] ' : '';
    const label = `${prefix}${match.teams?.[0] ?? 'Team A'} vs ${match.teams?.[1] ?? 'Team B'} · ${match.format ?? 'Bo3'} · ${match.event ?? 'HLTV Event'}`;
    const node = new HLTVNode(label, 'match');
    node.description = phase;
    node.matchUrl = match.url;
    node.tooltip = [
      `Teams: ${match.teams?.join(' vs ') ?? 'TBD'}`,
      `Format: ${match.format ?? 'Bo3'}`,
      `Event: ${match.event ?? 'HLTV Event'}`,
      `Time: ${match.date ?? 'Unknown time'}`,
      `Score: ${match.score ?? 'TBD'}`
    ].join('\n');
    node.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    groups[phase].push(node);
  }

  return [
    ...groups.live,
    ...groups.upcoming
  ];
}

function buildMatchDetailNodes(detail: { teams: [string, string]; date?: string; event?: string; format?: string; phase?: string; score?: string; liveScore?: string; mapResults?: Array<{ map: string; score: string; summary?: string }> } | null, label: string, url: string): HLTVNode[] {
  const nodes: HLTVNode[] = [];
  const teams = detail?.teams ?? ['Team A', 'Team B'];

  nodes.push(new HLTVNode(`Teams: ${teams[0]} vs ${teams[1]}`, 'detail'));
  if (detail?.date) {
    nodes.push(new HLTVNode(`Time: ${detail.date}`, 'detail'));
  }
  if (detail?.event) {
    nodes.push(new HLTVNode(`Event: ${detail.event}`, 'detail'));
  }
  if (detail?.format) {
    nodes.push(new HLTVNode(`Format: ${detail.format}`, 'detail'));
  }
  if (detail?.phase) {
    nodes.push(new HLTVNode(`Phase: ${detail.phase}`, 'detail'));
  }
  if (detail?.liveScore) {
    nodes.push(new HLTVNode(`Live score: ${detail.liveScore}`, 'detail'));
  }
  if (detail?.score) {
    nodes.push(new HLTVNode(`Summary: ${detail.score}`, 'detail'));
  }
  if (detail?.mapResults && detail.mapResults.length > 0) {
    for (const mapResult of detail.mapResults) {
      nodes.push(new HLTVNode(`${mapResult.map}: ${mapResult.score}${mapResult.summary ? ` • ${mapResult.summary}` : ''}`, 'detail'));
    }
  }

  const openMatchNode = new HLTVNode('Open match page', 'link');
  openMatchNode.command = {
    command: 'vscode.open',
    title: 'Open HLTV Match',
    arguments: [vscode.Uri.parse(url)]
  };
  nodes.push(openMatchNode);

  return nodes.length > 0 ? nodes : [new HLTVNode(`Match details for ${label}`, 'detail')];
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
    ...groups.headline,
    ...groups.flash
  ];
}

export class HLTVNode extends vscode.TreeItem {
  children?: HLTVNode[];
  matchUrl?: string;

  constructor(label: string, public readonly kind: 'section' | 'match' | 'news' | 'detail' | 'link' | 'message') {
    super(label, kind === 'section' || kind === 'match' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = kind === 'section' ? 'group' : kind === 'message' ? 'status' : kind === 'detail' ? 'detail' : kind === 'link' ? 'open' : 'match';
    this.contextValue = kind;
  }
}
