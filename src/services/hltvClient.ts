import { chromium, type Page } from 'playwright';

export interface MatchSummary {
  id: string;
  title: string;
  phase: 'past' | 'live' | 'upcoming';
  metadata: string;
  url: string;
  teams?: [string, string];
  format?: string;
  event?: string;
  date?: string;
  map?: string;
  score?: string;
  details?: MatchDetail;
}

export interface MatchMapResult {
  map: string;
  score: string;
  summary?: string;
}

export interface MatchPlayerStat {
  name: string;
  team?: string;
  kd?: string;
  roundSwing?: string;
  adr?: string;
  kast?: string;
  rating?: string;
}

export interface MatchDetail {
  teams: [string, string];
  event?: string;
  date?: string;
  format?: string;
  phase: MatchSummary['phase'];
  score?: string;
  summary?: string;
  liveScore?: string;
  mapResults: MatchMapResult[];
  playerStats?: MatchPlayerStat[];
  playerStatsBySection?: Array<{ section: string; players: MatchPlayerStat[] }>;
}

export interface NewsSummary {
  id: string;
  title: string;
  level: 'headline' | 'flash';
  publishedAt: string;
  url: string;
  content?: string;
  contentHtml?: string;
}

export interface EventPrizeDistribution {
  placement: string;
  team?: string;
  amount?: string;
  clubShare?: string;
}

export interface EventBracketMatch {
  round: string;
  team1?: string;
  team2?: string;
  score?: string;
  status?: string;
  matchUrl?: string;
  time?: string;
  format?: string;
}

export interface EventBracketRound {
  stage?: string;
  round: string;
  matches: EventBracketMatch[];
}

export interface EventSummary {
  id: string;
  name: string;
  url: string;
  status: 'live' | 'upcoming' | 'past';
  date?: string;
  prizePool?: string;
  teams?: number;
  location?: string;
  currentStage?: string;
  matches?: string[];
  standings?: Array<{ position: string; reward: string }>;
  prizeDistribution?: EventPrizeDistribution[];
  bracket?: EventBracketRound[];
  media?: string[];
}

export async function fetchNewsArticle(newsUrl: string): Promise<NewsSummary> {
  const url = newsUrl.startsWith('http') ? newsUrl : `${HLTV_BASE_URL}${newsUrl}`;

  return await withPage(url, async (articlePage) => {
    // await articlePage.waitForTimeout(500);
    const info = await articlePage.evaluate(() => {
      const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const keepSelector = [
        'p', 'li', 'ul', 'ol', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'span', 'img', 'picture',
        '.headertext', '.news-block', '.imagetext', '.image-con', '.newsitem-match-result', '.newsitem-match-result *',
        '.newsitem-match-stats-table', '.newsitem-match-stats-table *', '.newsitem-match-stats-header', '.newsitem-match-stats-row'
      ].join(',');

      const article = document.querySelector('article.newsitem');
      const body = article?.querySelector('.newstext-con') as HTMLElement | null;
      const headline = article?.querySelector('h1.headline') as HTMLElement | null;
      const dateText = article?.querySelector('.article-info .date')?.textContent ?? '';
      const filteredNodes = body ? Array.from(body.children).filter((node) => {
        const element = node as Element;
        return element.matches(keepSelector) || Boolean(element.querySelector(keepSelector));
      }) : [];
      const sanitizedHtml = filteredNodes.length > 0
        ? filteredNodes.map((node) => (node.cloneNode(true) as Element).outerHTML).join('')
        : (body ? body.innerHTML.trim() : article?.innerHTML?.trim() ?? '');

      const textNodes = body ? Array.from(body.querySelectorAll('p, li, h2, h3, h4, .imagetext, table, thead, tbody, tr, td, th, .newsitem-match-result, .newsitem-match-stats-table')) : [];
      const contentText = textNodes
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((value) => value && value.length > 12)
        .join('\n\n');

      return {
        title: normalizeText((headline?.textContent ?? document.title).replace(/\s*(?:\||-)\s*HLTV\.org.*$/i, '').trim()) || 'HLTV News',
        date: normalizeText(dateText),
        content: contentText || (body ? normalizeText(body.textContent ?? '') : ''),
        contentHtml: sanitizedHtml
      };
    });

    const title = info.title || 'HLTV News';
    const content = info.content || 'No article content could be extracted from HLTV.';

    return {
      id: slugify(`${url}-${title}`),
      title,
      level: /flash|analysis|interview|short/i.test(title) ? 'flash' : 'headline',
      publishedAt: info.date || 'Today',
      url,
      content,
      contentHtml: info.contentHtml
    } satisfies NewsSummary;
  });
}

const HLTV_BASE_URL = 'https://www.hltv.org';

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'hltv-item';
}

function cleanEventTitle(value: string): string {
  const normalized = normalizeText(value)
    .replace(/\s*\|\s*HLTV\.org\s*$/i, '')
    .replace(/^\s*LIVE\s+/i, '')
    .replace(/\s+(?:overview|results|bracket|schedule|matches|standings)\s*$/i, '')
    .replace(/\s*(?:LAN|Online)\s*(?:[-–]\s*)?(?:[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)?)\s*$/i, '')
    .replace(/\s*(?:LAN|Online)\s*(?:[-–]\s*)?\d{4}\s*$/i, '')
    .replace(/\s*(?:LAN|Online)\s*(?:[-–]\s*)?(?:[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)?)?\s*$/i, '')
    .replace(/\s*(?:LAN|Online)\s*(?:[-–]\s*)?(?:[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)?)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalized || 'HLTV Event';
}

function formatBracketTime(timestampMs?: number): string | undefined {
  if (!timestampMs || Number.isNaN(timestampMs)) {
    return undefined;
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).replace(/\s+/g, ' ').trim();
}

function humanizeBracketRound(roundName: string): string {
  const normalized = normalizeText(roundName)
    .replace(/^.*\./, '')
    .replace(/^Round\s+/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const lower = normalized.toLowerCase();
  if (/upper.*semi|semi.*upper/i.test(lower)) return 'Upper semi-finals';
  if (/lower.*semi|semi.*lower/i.test(lower)) return 'Lower semi-finals';
  if (/quarterfinal|quarter-final|round4|round-4|round 4|1\/4/i.test(lower)) return 'Quarter-finals';
  if (/semifinal|semi-final|round2|round-2|round 2|1\/2/i.test(lower)) return 'Semi-finals';
  if (/grandfinal|final|championship/i.test(lower) || /round1|round-1|round 1|1\/1/i.test(lower)) return 'Grand Final';
  if (/round8|round-8|round 8|round of 16|1\/8|1\/16/i.test(lower)) return 'Round of 16';
  if (/round16|round-16|round 16|1\/16/i.test(lower)) return 'Round of 16';
  if (/round32|round-32|round 32|1\/32/i.test(lower)) return 'Round of 32';
  if (/group/i.test(lower) || /stage/i.test(lower)) return 'Group Stage';
  return normalized || 'Round';
}

function detectBracketTypeName(value?: string): string {
  if (!value) return 'Bracket';
  if (/singleelimination|playoff/i.test(value)) return 'Playoffs';
  if (/doubleelimination|group.*stage|groupstage|group/i.test(value)) return 'Group Stage';
  return 'Bracket';
}

function detectCloudflare(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const title = document.title || '';
    const bodyText = document.body ? document.body.innerText || '' : '';
    return /just a moment|cloudflare|cf-challenge|enable javascript and cookies/i.test(`${title}\n${bodyText}`);
  });
}

async function withPage<T>(url: string, callback: (page: Page) => Promise<T>, delayMs = 0): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache'
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }

    if (await detectCloudflare(page)) {
      throw new Error('HLTV is requesting a Cloudflare verification. Please retry after the browser has had a chance to load the page normally.');
    }

    return await callback(page);
  } finally {
    await browser.close();
  }
}

function classifyMatchPhase(raw: string): MatchSummary['phase'] {
  const text = raw.toLowerCase();
  if (/(live|playing|in progress|current)/.test(text) || /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/.test(text)) {
    return 'live';
  }

  if (/(upcoming|tomorrow|today|starts|scheduled|vs\s*\w)/.test(text) || /@\s?\d{1,2}:\d{2}/.test(text) || /\b\d{1,2}:\d{2}\b/.test(text)) {
    return 'upcoming';
  }

  return 'past';
}

function cleanTitleText(value: string): string {
  return normalizeText(value)
    .replace(/([a-z])(?=(?:an?|\d+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 ')
    .replace(/\s+\d+\s*comments?\b.*$/gi, '')
    .replace(/\s+(?:an?|[0-9]+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago.*$/gi, '')
    .replace(/#\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCompactTeamNames(value: string): string[] {
  const compact = normalizeText(value).replace(/[^A-Za-z0-9]/g, '');
  if (!compact) {
    return [];
  }

  if (compact.toLowerCase().includes('vs')) {
    return compact.split(/vs/i).flatMap((part) => splitCompactTeamNames(part)).filter(Boolean);
  }

  const splitIndex = [...compact].findIndex((char, index, chars) => {
    if (index === 0 || index === chars.length - 1) {
      return false;
    }
    const prevIsWordBoundary = /[A-Za-z0-9]/.test(chars[index - 1]);
    const prevLower = /[a-z]/.test(chars[index - 1]);
    const nextLower = /[a-z]/.test(chars[index + 1] ?? '');
    const remainingUpper = chars.slice(index + 1).length >= 2 && [...chars.slice(index + 1)].every((nextChar) => /[A-Z0-9]/.test(nextChar));
    return prevIsWordBoundary && /[A-Z]/.test(char) && (nextLower || (prevLower && remainingUpper));
  });

  if (splitIndex > 0 && splitIndex < compact.length - 1) {
    const first = compact.slice(0, splitIndex);
    const second = compact.slice(splitIndex);
    return [first, second].map((part) => normalizeText(part)).filter(Boolean);
  }

  return [compact];
}

function slugToReadableTitle(slug: string): string {
  const withoutHash = slug.replace(/#.*$/, '').trim();
  if (!withoutHash) {
    return 'HLTV';
  }

  const segments = decodeURIComponent(withoutHash)
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.replace(/^vs$/i, 'vs'));

  if (segments.length === 0) {
    return 'HLTV';
  }

  const normalized = segments.join(' ');
  const withVsSpacing = normalized.replace(/\bvs\b/gi, ' vs ');
  const words = withVsSpacing.split(/\s+/).filter(Boolean);
  const readable = words
    .map((word) => {
      const lower = word.toLowerCase();
      if (/^(mouz|nip|g2|furia|vp|vit|aurora|spirit|falcons|astral|navi|pr|gambit|blast|hltv|m80|ruby|ex|vs)$/i.test(lower)) {
        return lower === 'vs' ? 'vs' : lower === 'falcons' ? 'Falcons' : word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return readable.replace(/\s+vs\s+/gi, ' vs ');
}

function buildMatchLabel(values: string[], href?: string): string {
  const hrefTitle = href ? slugToReadableTitle(new URL(href).pathname.split('/').filter(Boolean).slice(-1)[0] ?? '') : '';
  if (hrefTitle && hrefTitle !== 'HLTV') {
    return hrefTitle;
  }

  const teamCandidates = values.flatMap((value) => splitCompactTeamNames(value));
  const cleaned = values
    .map((value) => cleanTitleText(value))
    .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
    .filter((value, index, arr) => arr.indexOf(value) === index);

  const sanitizeTeamToken = (value: string): string => normalizeText(value)
    .replace(/^(?:live\s*)+/i, '')
    .replace(/(?:\s*bo\d+)+$/i, '')
    .replace(/(?:\s*live)+$/i, '')
    .trim();

  const splitTeams = teamCandidates
    .map((value) => sanitizeTeamToken(value))
    .flatMap((value) => {
      if (!value) {
        return [];
      }
      const nested = splitCompactTeamNames(value);
      return nested.length > 1 ? nested.map((part) => sanitizeTeamToken(part)) : [value];
    })
    .filter((value) => value && value.length > 2 && !/^bo\d+$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .filter((value) => !/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value));

  if (splitTeams.length >= 2) {
    return `${splitTeams[0]} vs ${splitTeams[1]}`;
  }

  if (cleaned.length === 0) {
    return 'HLTV Match';
  }

  const event = cleaned.find((value) => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value)) ?? cleaned[0];
  const format = values.find((value) => /^bo\d+$/i.test(normalizeText(value))) ?? 'Bo3';
  const teams = cleaned.filter((value) => value !== event).slice(0, 2);
  const teamText = teams.length >= 2 ? `${teams[0]} vs ${teams[1]}` : cleaned.slice(0, 2).join(' vs ');

  return `${teamText} · ${format} · ${event}`;
}

function buildNewsLabel(values: string[], href?: string): string {
  const hrefTitle = href ? slugToReadableTitle(new URL(href).pathname.split('/').filter(Boolean).slice(-1)[0] ?? '') : '';
  if (hrefTitle && hrefTitle !== 'HLTV') {
    return hrefTitle;
  }

  const cleaned = values
    .map((value) => cleanTitleText(value))
    .filter((value) => value && value.length > 6)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return cleaned[0] ?? 'HLTV News';
}

function isLikelyTeamName(value: string): boolean {
  const text = normalizeText(value);
  if (!text || text.length < 2) {
    return false;
  }
  if (/^bo\d+$/i.test(text) || /^live$/i.test(text) || /^\d+$/i.test(text) || /^\d+\s*[-:]\s*\d+$/i.test(text)) {
    return false;
  }
  if (/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season|group|final|playoff|major/i.test(text)) {
    return false;
  }
  return !/^\s*\(\s*\)\s*$/.test(text);
}

function readTeamNameFromMatchLink(link: Element, side: 'team1' | 'team2'): string | null {
  const selectors = [
    `.match-team.${side} .match-teamname`,
    `.line-align.${side} .team`,
    `.${side} .team`,
    `.${side} .teamName`,
    `.${side} .match-teamname`,
    `.match-teamname`,
    `.team` 
  ];

  const names = new Set<string>();
  for (const selector of selectors) {
    for (const element of Array.from(link.querySelectorAll(selector))) {
      const value = normalizeText(element.textContent ?? '');
      if (isLikelyTeamName(value)) {
        names.add(value);
      }
    }
  }

  const orderedNames = Array.from(names);
  const nameIndex = side === 'team1' ? 0 : 1;
  return orderedNames[nameIndex] ?? null;
}

function extractTeamNamesFromMatchLink(link: Element): [string, string] | null {
  const directTeamNames = Array.from(
    new Set(
      Array.from(link.querySelectorAll('.match-teamname, .teamName, .line-align .team, .match-team .team')).map((element) => normalizeText(element.textContent ?? '')).filter(isLikelyTeamName)
    )
  );

  if (directTeamNames.length >= 2) {
    return [directTeamNames[0], directTeamNames[1]] as [string, string];
  }

  const team1 = readTeamNameFromMatchLink(link, 'team1');
  const team2 = readTeamNameFromMatchLink(link, 'team2');

  if (team1 && team2) {
    return [team1, team2] as [string, string];
  }

  const combinedText = normalizeText(link.textContent ?? '');
  const teamCandidates = splitCompactTeamNames(combinedText)
    .map((value) => normalizeText(value))
    .filter(isLikelyTeamName)
    .filter((value, index, array) => array.indexOf(value) === index);

  if (teamCandidates.length >= 2) {
    return [teamCandidates[0], teamCandidates[1]] as [string, string];
  }

  return null;
}

function pickTeamNamesFromPage(page: Page): Promise<[string, string]> {
  return page.evaluate(() => {
    const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    const names = Array.from(document.querySelectorAll('.teamName, .dropdownTeam'))
      .map((element) => normalizeText((element.textContent ?? '').replace(/\s+/, ' ')))
      .filter((value) => value && value.length > 1)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 2);

    if (names.length >= 2) {
      return [names[0], names[1]] as [string, string];
    }

    const matchText = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
    const fallback = matchText.match(/([A-Z0-9][A-Za-z0-9 .'-]{1,20})\s+([0-9]{1,2}:?[0-9]{0,2})\s+([A-Z0-9][A-Za-z0-9 .'-]{1,20})/);
    if (fallback) {
      return [fallback[1], fallback[3]] as [string, string];
    }

    return ['Team A', 'Team B'];
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMapName(text: string): string | undefined {
  const mapNames = ['Dust2', 'Mirage', 'Nuke', 'Inferno', 'Ancient', 'Overpass', 'Vertigo', 'Train', 'Anubis', 'Cache', 'Tuscan', 'Cobblestone', 'Office'];
  for (const mapName of [...mapNames].sort((a, b) => b.length - a.length)) {
    if (new RegExp(mapName, 'i').test(text)) {
      return mapName;
    }
  }
  return undefined;
}

function parseMapHolderText(text: string): MatchMapResult | undefined {
  const compact = normalizeText(text).replace(/\s+/g, '');
  const mapName = findMapName(compact);
  if (!mapName) {
    return undefined;
  }

  const afterMap = compact.slice(compact.indexOf(mapName) + mapName.length);
  const directScoreMatch = afterMap.match(/([A-Za-z0-9 .'-]+?)\s*(\d+)\s*(?:\(([^)]*)\))?\s*([A-Za-z0-9 .'-]+?)\s*(\d+)\s*$/i);
  if (directScoreMatch) {
    const leftScore = directScoreMatch[2];
    const summary = directScoreMatch[3] ? normalizeText(directScoreMatch[3]).replace(/;\s*/g, '; ') : 'Map score history';
    const rightScore = directScoreMatch[5];
    return {
      map: mapName,
      score: `${leftScore}-${rightScore}`,
      summary
    };
  }

  const summaryMatch = afterMap.match(/\(([^)]*)\)/);
  const trailingScoreMatch = afterMap.match(/(\d+)\s*$/);
  if (summaryMatch && trailingScoreMatch) {
    return {
      map: mapName,
      score: `${summaryMatch[0].match(/(\d+)/)?.[1] ?? '0'}-${trailingScoreMatch[1]}`,
      summary: normalizeText(summaryMatch[1]).replace(/;\s*/g, '; ')
    };
  }

  if (/scoreboard|round over|winner:|planted the bomb|game log/i.test(text) || /R:\s*\d+\s*-/i.test(text)) {
    return { map: mapName, score: 'LIVE', summary: 'Live map in progress' };
  }

  return { map: mapName, score: 'TBD', summary: 'Map not started' };
}

function parseMatchMapResults(text: string, teams: [string, string]): MatchMapResult[] {
  const results: MatchMapResult[] = [];
  const matchBlocks = [...text.matchAll(/(?:^|\s)([A-Za-z0-9][A-Za-z0-9' -]*?(?:Dust2|Mirage|Nuke|Inferno|Ancient|Overpass|Vertigo|Train|Anubis|Cache|Tuscan|Cobblestone|Office)[A-Za-z0-9' -]*?)\s*(?:\b|[A-Z0-9])(?:[A-Za-z0-9]+\d+STATS\s*\([^)]*\)[A-Za-z0-9]+\d+|[A-Za-z0-9]+-[A-Za-z0-9]+-?)/gi)];
  if (!matchBlocks.length) {
    const mapHolders = [...new Set((text.match(/(?:Nuke|Mirage|Inferno|Ancient|Dust2|Overpass|Vertigo|Train|Anubis|Cache|Tuscan|Cobblestone|Office)/gi) ?? []))];
    for (const mapName of mapHolders) {
      results.push({ map: mapName, score: 'TBD', summary: 'Map not started' });
    }
    return results.slice(0, 5);
  }

  for (const block of matchBlocks) {
    const parsed = parseMapHolderText(block[0]);
    if (parsed) {
      results.push(parsed);
    }
  }

  const seen = new Set<string>();
  return results.filter((entry) => {
    const key = `${entry.map}-${entry.score}-${entry.summary ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function getFinalSeriesScore(mapResults: MatchMapResult[]): string | undefined {
  if (!mapResults.length) {
    return undefined;
  }

  let left = 0;
  let right = 0;

  for (const mapResult of mapResults) {
    const scoreParts = mapResult.score.split('-').map((part) => Number.parseInt(part, 10));
    if (scoreParts.length !== 2 || scoreParts.some((part) => Number.isNaN(part))) {
      continue;
    }

    const [scoreLeft, scoreRight] = scoreParts;
    if (scoreLeft > scoreRight) {
      left += 1;
    } else if (scoreRight > scoreLeft) {
      right += 1;
    }
  }

  return `${left}:${right}`;
}

function normalizeScoreText(value: string): string | undefined {
  const text = normalizeText(value);
  const liveMatch = text.match(/^(\d+)\s*\(\d+\)\s*(\d+)\s*\(\d+\)$/i);
  if (liveMatch) {
    return `${liveMatch[1]}-${liveMatch[2]}`;
  }

  const simpleMatch = text.match(/^(\d+)\s*[:\-]\s*(\d+)$/i);
  if (simpleMatch) {
    return `${simpleMatch[1]}-${simpleMatch[2]}`;
  }

  const reversedSimple = text.match(/^(\d+)\s*(?:\|\s*|\s+)\s*(\d+)$/i);
  if (reversedSimple) {
    return `${reversedSimple[1]}-${reversedSimple[2]}`;
  }

  return undefined;
}

async function getPlayerStats(page: Page): Promise<MatchPlayerStat[]> {
  return (await getPlayerStatsBySection(page)).flatMap((section) => section.players);
}

async function getPlayerStatsBySection(page: Page): Promise<Array<{ section: string; players: MatchPlayerStat[] }>> {
  return await page.evaluate(() => {
    const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    const toPlayers = (table: Element): MatchPlayerStat[] => {
      const teamName = normalizeText(
        table.querySelector('tr.header-row td.players .teamName, tr.header-row td.players a, tr.header-row td.players')?.textContent ?? ''
      );
      const rows: MatchPlayerStat[] = [];

      for (const row of Array.from(table.querySelectorAll('tr:not(.header-row)'))) {
        const cells = Array.from(row.querySelectorAll('td'));
        const playerCell = cells.find((cell) => cell.classList.contains('players'));
        const name = normalizeText(
          playerCell?.querySelector('.statsPlayerName')?.textContent ??
          playerCell?.querySelector('a')?.textContent ??
          playerCell?.textContent ??
          ''
        );

        if (!name) {
          continue;
        }

        const metrics: Record<string, string> = {};
        for (const cell of cells) {
          const classNames = (cell.className || '').toString().split(/\s+/).filter(Boolean);
          const value = normalizeText(cell.textContent ?? '');
          if (!value) {
            continue;
          }

          if (classNames.includes('kd')) {
            metrics.kd = value;
          } else if (classNames.includes('roundSwing')) {
            metrics.roundSwing = value;
          } else if (classNames.includes('adr')) {
            metrics.adr = value;
          } else if (classNames.includes('kast')) {
            metrics.kast = value;
          } else if (classNames.includes('rating')) {
            metrics.rating = value;
          }
        }

        if (!metrics.kd && !metrics.adr && !metrics.kast && !metrics.rating) {
          continue;
        }

        rows.push({
          name,
          team: teamName || undefined,
          kd: metrics.kd,
          roundSwing: metrics.roundSwing,
          adr: metrics.adr,
          kast: metrics.kast,
          rating: metrics.rating
        });
      }

      return rows;
    };

    const sections: Array<{ section: string; players: MatchPlayerStat[] }> = [];
    const sectionNodes = Array.from(document.querySelectorAll('.stats-content'));
    let mapIndex = 1;

    for (const sectionNode of sectionNodes) {
      const id = sectionNode.id || '';
      let sectionName = 'Summary';
      if (id !== 'all-content' && id !== 'all') {
        const dynamicName = Array.from(document.querySelectorAll('.dynamic-map-name-full')).find((node) => node.id === id.replace('-content', ''));
        const mapName = normalizeText(dynamicName?.textContent ?? '');
        sectionName = mapName ? `Map ${mapIndex}: ${mapName}` : `Map ${mapIndex}`;
        mapIndex += 1;
      }

      const players: MatchPlayerStat[] = [];

      for (const table of Array.from(sectionNode.querySelectorAll('.table.totalstats'))) {
        players.push(...toPlayers(table));
      }

      if (players.length > 0) {
        sections.push({ section: sectionName, players });
      }
    }

    if (sections.length === 0) {
      const scoreboard = document.querySelector('.scoreboard');
      if (scoreboard) {
        const teamNames = Array.from(scoreboard.querySelectorAll('.teamName')).map((node) => normalizeText(node.textContent ?? '')).filter(Boolean);
        const teamName = teamNames[0] ?? 'Team A';
        const rows = Array.from(scoreboard.querySelectorAll('tr'));
        const players: MatchPlayerStat[] = [];

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th')).map((cell) => normalizeText(cell.textContent ?? '')).filter(Boolean);
          if (cells.length === 0 || cells.some((cell) => /^(?:K|A|D|ADR|\$)$/.test(cell)) || cells.some((cell) => /Overtake Sector|Marsborne/i.test(cell))) {
            continue;
          }

          const name = cells[0];
          if (!name || /^(?:Team|Player)$/.test(name)) {
            continue;
          }

          const numericValues = cells
            .map((cell) => cell.replace(/[$%]/g, '').replace(/,/g, ''))
            .filter((cell) => /^-?\d+(?:\.\d+)?$/.test(cell))
            .map((cell) => Number.parseFloat(cell));

          if (numericValues.length === 0) {
            continue;
          }

          const kdParts = numericValues.slice(0, 2);
          const adrValue = numericValues[numericValues.length - 1];
          const kd = kdParts.length === 2 && Number.isFinite(kdParts[0]) && Number.isFinite(kdParts[1]) ? `${kdParts[0]}-${kdParts[1]}` : undefined;
          const adr = Number.isFinite(adrValue) ? `${adrValue}` : undefined;

          players.push({
            name,
            team: teamName,
            kd,
            adr,
            rating: undefined,
            kast: undefined,
            roundSwing: undefined
          });
        }

        if (players.length > 0) {
          sections.push({ section: 'Summary', players });
        }
      }
    }

    return sections;
  });
}

async function getMatchScheduleInfo(page: Page): Promise<{ dateTime?: string; date?: string; rawTime?: string } | undefined> {
  return await page.evaluate(() => {
    const timeEl = document.querySelector('.time[data-unix]');
    const dateEl = document.querySelector('.date[data-unix]');
    const rawUnixInput = timeEl?.getAttribute('data-unix') ?? dateEl?.getAttribute('data-unix') ?? '';
    const rawUnix = Number(rawUnixInput);

    if (Number.isFinite(rawUnix)) {
      const date = new Date(rawUnix);
      const dateString = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const timeString = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        dateTime: `${dateString} ${timeString}`.trim(),
        date: dateString,
        rawTime: timeString,
        visibleTime: timeString,
        visibleDate: dateString
      };
    }

    const visibleTime = timeEl?.textContent?.trim() ?? '';
    const visibleDate = dateEl?.textContent?.trim() ?? '';
    if (visibleTime || visibleDate) {
      return {
        dateTime: [visibleDate, visibleTime].filter(Boolean).join(' '),
        date: visibleDate,
        rawTime: visibleTime,
        visibleTime,
        visibleDate
      };
    }

    return undefined;
  });
}

export async function fetchMatchDetail(matchUrl: string): Promise<MatchDetail | null> {
  return await withPage(matchUrl, async (page) => {
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const text = normalizeText(bodyText);
    const teams = await pickTeamNamesFromPage(page);
    const phase: MatchSummary['phase'] = classifyMatchPhase(bodyText);
    const schedule = await getMatchScheduleInfo(page);
    const date = schedule?.dateTime ?? bodyText.match(/\d{1,2}(?:st|nd|rd|th) of [A-Za-z]+ \d{4}/i)?.[0]
      ?? bodyText.match(/[A-Za-z]+ \d{1,2}, \d{4}/i)?.[0]
      ?? undefined;
    const event = title.includes(' at ') ? title.split(' at ')[1]?.replace(/\s+-\s+HLTV.*$/i, '') : undefined;
    const liveMapState = await page.evaluate(() => {
      const selectors = ['.mapname', '.dynamic-map-name-full'];
      const mapNames = ['Dust2', 'Mirage', 'Nuke', 'Inferno', 'Ancient', 'Overpass', 'Vertigo', 'Train', 'Anubis', 'Cache', 'Tuscan', 'Cobblestone', 'Office'];
      const liveScoreboard = document.querySelector('#scoreboardElement')?.textContent ?? document.querySelector('.scoreboard')?.textContent ?? '';
      const scoreboardMap = mapNames.find((name) => liveScoreboard.toLowerCase().includes(name.toLowerCase()));
      const mapholderEntries = Array.from(document.querySelectorAll('.mapholder'))
        .map((node) => {
          const text = (node.querySelector('.mapname')?.textContent ?? node.getAttribute('title') ?? node.textContent ?? '').replace(/\s+/g, ' ').trim();
          const mapName = mapNames.find((name) => text.toLowerCase().includes(name.toLowerCase()));
          return mapName ? { mapName, node } : null;
        })
        .filter((entry): entry is { mapName: string; node: Element } => Boolean(entry));

      const activeEntry = mapholderEntries.at(-1) ?? null;
      const activeMap = activeEntry?.mapName ?? scoreboardMap ?? null;
      const scoreText = liveScoreboard.replace(/\s+/g, ' ').trim();
      const liveSummary = scoreText.match(/R:\s*\d+\s*-\s*([A-Za-z0-9 ]+?)(?:\d{1,2}:\d{2}(?::\d{2})?|$)/i)?.[1]?.trim();

      return {
        mapName: activeMap,
        summary: liveSummary && activeMap ? `Live on ${activeMap} · ${liveSummary}` : activeMap ? `Live on ${activeMap}` : undefined,
        hasLiveBoard: /R:\s*\d+\s*-\s*/i.test(scoreText) || /Round over|Winner:|planted the bomb|Game log/i.test(scoreText)
      };
    });
    const mapResults = await page.evaluate(() => {
      const mapNames = ['Dust2', 'Mirage', 'Nuke', 'Inferno', 'Ancient', 'Overpass', 'Vertigo', 'Train', 'Anubis', 'Cache', 'Tuscan', 'Cobblestone', 'Office'];
      const parseMapHolder = (text: string) => {
        const compact = text.replace(/\s+/g, '');
        const mapName = mapNames.find((name) => compact.toLowerCase().includes(name.toLowerCase()));
        if (!mapName) {
          return null;
        }

        const statsIndex = compact.toUpperCase().indexOf('STATS');
        if (statsIndex !== -1) {
          const beforeSummary = compact.slice(compact.indexOf(mapName) + mapName.length, statsIndex);
          const afterSummary = compact.slice(statsIndex + 'STATS'.length);
          const summaryMatch = afterSummary.match(/\(([^)]*)\)/);
          const leftScoreMatch = beforeSummary.match(/(\d+)$/i);
          const rightText = afterSummary.replace(/\([^)]*\)/, '');
          const rightScoreMatch = rightText.match(/(\d+)$/i);

          if (leftScoreMatch && rightScoreMatch) {
            return {
              map: mapName,
              score: `${leftScoreMatch[1]}-${rightScoreMatch[1]}`,
              summary: ((summaryMatch ? summaryMatch[1] : '').replace(/\s+/g, ' ').trim() || 'Map score history').replace(/;\s*/g, '; ')
            };
          }
        }

        const activeMapName = Array.from(document.querySelectorAll('.mapholder'))
          .map((node) => {
            const text = (node.querySelector('.mapname')?.textContent ?? '').replace(/\s+/g, ' ').trim();
            return mapNames.find((name) => text.toLowerCase().includes(name.toLowerCase())) ?? null;
          })
          .filter((value): value is string => Boolean(value))
          .at(-1) ?? null;
        const hasLiveBoard = /R:\s*\d+\s*-\s*/i.test(document.body?.textContent ?? '') || /Round over|Winner:|planted the bomb|Game log/i.test(document.body?.textContent ?? '');
        if (hasLiveBoard && mapName === activeMapName) {
          return { map: mapName, score: 'LIVE', summary: 'Live map in progress' };
        }

        return { map: mapName, score: 'TBD', summary: 'Map not started' };
      };

      return Array.from(document.querySelectorAll('.mapholder'))
        .map((node) => parseMapHolder((node.textContent || '').replace(/\s+/g, ' ').trim()))
        .filter((entry): entry is { map: string; score: string; summary: string } => Boolean(entry));
    });
    const mapResultsWithLive = liveMapState && liveMapState.mapName
      ? mapResults.map((entry) => ({
        ...entry,
        ...(entry.score === 'TBD' && entry.map.toLowerCase() === liveMapState.mapName!.toLowerCase())
          ? { score: 'LIVE', summary: liveMapState.summary ?? 'Live map in progress' }
          : {}
      }))
      : mapResults;
    const score = getFinalSeriesScore(mapResultsWithLive);
    const liveScore = await page.evaluate(() => {
      const liveText = document.querySelector('#scoreboardElement')?.textContent ?? document.querySelector('.scoreboard')?.textContent ?? '';
      const scoreText = (liveText || '').replace(/\s+/g, ' ').trim();
      const scoreMatch = scoreText.match(/R:\s*\d+\s*-\s*\d+.*?\d+\s*:\s*\d+/i);
      return scoreMatch ? scoreMatch[0] : undefined;
    });
    const playerStatsBySection = await getPlayerStatsBySection(page);
    const playerStats = playerStatsBySection.flatMap((section) => section.players);

    return {
      teams,
      event,
      date,
      format: bodyText.match(/Best of \d+/i)?.[0] ?? 'Bo3',
      phase,
      score,
      liveScore,
      summary: bodyText.slice(0, 280),
      mapResults: mapResultsWithLive,
      playerStats,
      playerStatsBySection
    } satisfies MatchDetail;
  });
}

export async function fetchEvents(progress?: (message: string, current: number, total: number) => void): Promise<EventSummary[]> {
  progress?.('events…', 1, 1);
  const items = await withPage(`${HLTV_BASE_URL}/events`, async (page) => {
    return await page.evaluate(() => {
      const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const normalizeEventTitle = (value: string | number | null | undefined): string => normalizeText(value)
        .replace(/^\s*LIVE\s+/i, '')
        .replace(/\s+(?:overview|results|bracket|schedule|matches|standings)\s*$/i, '')
        .replace(/\s*(?:LAN|Online)\s*(?:[-–]\s*)?(?:[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)?)\s*$/i, '')
        .replace(/\s*(?:LAN|Online)\s*$/i, '')
        .replace(/\s*\d{4}\s*(?:LAN|Online)\s*$/i, '')
        .replace(/\s*\d{4}\s*(?:LAN|Online)\s*(?:[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Z][a-z]{2,}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)?)?\s*$/i, '')
        .trim();

      const readEventTitle = (link: Element): { title: string; isBig: boolean } => {
        const bigNode = link.querySelector('.big-event-name');
        const exactTitleNode = link.querySelector('.event-col.col-value > .text-ellipsis, .event-col .col-value > .text-ellipsis, .event-col .text-ellipsis');
        const direct = exactTitleNode ?? link.querySelector('.big-event-name, .event-name, .event-title, .event-hub-title, .text-ellipsis, h1');
        const text = normalizeText((direct?.textContent ?? link.textContent ?? '').replace(/\u00a0/g, ' '));
        const title = normalizeEventTitle(text).replace(/^Live\s+/i, '').replace(/\s+Live$/i, '').trim();
        return { title, isBig: Boolean(bigNode) || /big-event-name/i.test((link as HTMLElement).className || '') };
      };
      const seen = new Set<string>();
      const candidates = Array.from(document.querySelectorAll('a[href*="/events/"]'))
        .map((link) => {
          const href = (link as HTMLAnchorElement).href;
          const { title, isBig } = readEventTitle(link);
          const parentText = normalizeText((link.closest('li, div, article, section, tr')?.textContent ?? ''));
          return { href, text: title, isBig, parentText };
        })
        .filter(({ href, text, parentText }) => {
          if (!href || text.length <= 3) {
            return false;
          }
          const combined = `${text} ${parentText}`;
          if (!/\/events\//i.test(href) || /\/events\/$/i.test(href) || /\/events(?:\/)?(?:archive|#|\?)/i.test(href)) {
            return false;
          }
          if (/archive|played events|ongoing events|featured|today|all/i.test(combined)) {
            return false;
          }
          return true;
        });

      return candidates
        .filter(({ href, text, parentText }) => {
          const key = `${href}::${text}::${parentText}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        .slice(0, 18)
        .map(({ href, text, parentText, isBig }) => {
          const combined = `${text} ${parentText}`;
          const title = normalizeEventTitle(text) || 'HLTV Event';
          const name = isBig ? `[BIG] ${title}` : title;
          const status: EventSummary['status'] = /live/i.test(combined) ? 'live' : 'upcoming';
          return {
            id: href,
            name,
            url: href,
            status,
            date: undefined,
            prizePool: undefined,
            teams: undefined,
            location: undefined,
            currentStage: undefined,
            matches: undefined,
            standings: undefined,
            media: []
          } as EventSummary;
        });
    });
  });

  progress?.('Events loaded', 1, 1);
  return items.length > 0 ? items : [{
    id: 'events-placeholder',
    name: 'No events parsed yet',
    url: `${HLTV_BASE_URL}/events`,
    status: 'upcoming',
    media: []
  }];
}

export async function fetchEventDetail(eventUrl: string): Promise<EventSummary | null> {
  return await withPage(eventUrl, async (page) => {
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const overview = await page.evaluate(() => {
      const normalize = (value: unknown): string =>
        String(value ?? '')
          .replace(/\s+/g, ' ')
          .replace(/\u00a0/g, ' ')
          .trim();

      const firstTextFrom = (...selectors: string[]) => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          const text = normalize(node?.textContent ?? '');
          if (text) {
            return text;
          }
        }
        return undefined;
      };

      const infoTable = document.querySelector('.event-header-component table.info');
      const date = firstTextFrom('.event-header-component table.info td.eventdate', '.event-header-component .eventdate', '.event-date')
        ?? infoTable?.querySelector('.eventdate')?.textContent
        ?? undefined;
      const prizePool = firstTextFrom('.event-header-component table.info td.prizepool', '.event-header-component .prizepool', '.prizepool')
        ?? infoTable?.querySelector('.prizepool')?.textContent
        ?? undefined;
      const location = firstTextFrom('.event-header-component table.info td.location', '.event-header-component .location', '.location')
        ?? infoTable?.querySelector('.location')?.textContent
        ?? undefined;
      const teamsText = firstTextFrom('.event-header-component table.info td.teamsNumber', '.event-header-component .teamsNumber', '.teamsNumber')
        ?? infoTable?.querySelector('.teamsNumber')?.textContent
        ?? undefined;
      const stage = firstTextFrom('.section-header.brackets span', '.section-header span', '.current-stage', '.event-header-component .stage')
        || 'Overview';

      const placements = Array.from(document.querySelectorAll('.placements-holder .placement')).map((placementEl) => {
        const placement = placementEl as HTMLElement;
        const teamNode = placement.querySelector('.team');
        const teamText = normalize(teamNode?.textContent ?? '');
        const rankText = Array.from(placement.children)
          .map((node) => ({
            node: node as HTMLElement,
            text: normalize((node as HTMLElement).textContent ?? '')
          }))
          .find(({ node, text }) => text && !['team', 'team-logo', 'prize', 'club-share'].some((className) => node.classList.contains(className)))?.text;
        const prizeText = Array.from(placement.querySelectorAll('.prize'))
          .map((node) => normalize(node.textContent ?? ''))
          .find((text) => text && !text.startsWith('+ Club share:'));
        const clubShareText = Array.from(placement.querySelectorAll('.prize.club-share'))
          .map((node) => normalize(node.textContent ?? ''))
          .find(Boolean);

        return {
          placement: rankText || 'Unranked',
          team: teamText || undefined,
          amount: prizeText || undefined,
          clubShare: clubShareText || undefined,
        };
      }).filter((entry) => entry.placement || entry.team || entry.amount);

      const humanizeBracketRoundName = (raw?: string): string => {
        const value = normalize(String(raw ?? ''))
          .replace(/^.*\./, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (!value) {
          return 'Round';
        }
        const lower = value.toLowerCase();
        if (/upper.*semi|semi.*upper/i.test(lower)) return 'Upper semi-finals';
        if (/lower.*semi|semi.*lower/i.test(lower)) return 'Lower semi-finals';
        if (/quarterfinal|quarter-final|round4|round-4|round 4|1\/4/i.test(lower)) return 'Quarter-finals';
        if (/semifinal|semi-final|round2|round-2|round 2|1\/2/i.test(lower)) return 'Semi-finals';
        if (/grandfinal|final|championship|round1|round-1|round 1|1\/1/i.test(lower)) return 'Grand Final';
        if (/round8|round-8|round 8|round of 16|1\/8|1\/16|sixteen/i.test(lower)) return 'Round of 16';
        if (/round16|round-16|round 16|1\/16/i.test(lower)) return 'Round of 16';
        if (/round32|round-32|round 32|1\/32/i.test(lower)) return 'Round of 32';
        if (/group|stage/i.test(lower)) return 'Group Stage';
        return value;
      };

      const coerceText = (value: any): string => {
        if (value == null) {
          return '';
        }
        if (typeof value === 'string') {
          return normalize(value);
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        if (Array.isArray(value)) {
          return value.map((item) => coerceText(item)).filter(Boolean).join(' ');
        }
        if (typeof value === 'object') {
          const record = value as Record<string, any>;
          const candidates = ['text', 'label', 'name', 'title', 'status', 'description', 'value', 'result', 'score'];
          const directMatches = [] as string[];
          for (const key of candidates) {
            const entry = record[key];
            if (entry != null && entry !== '') {
              const text = coerceText(entry);
              if (text) {
                directMatches.push(text);
              }
            }
          }
          if (directMatches.length > 0) {
            return directMatches.join(' ');
          }

          if (record.team1 != null || record.team2 != null) {
            const left = coerceText(record.team1);
            const right = coerceText(record.team2);
            const scoreText = [left, right].filter(Boolean).join('-');
            if (scoreText) {
              return scoreText;
            }
          }

          if (record.score != null && typeof record.score !== 'object') {
            return coerceText(record.score);
          }

          for (const key of Object.keys(record)) {
            const text = coerceText(record[key]);
            if (text) {
              return text;
            }
          }
        }
        return '';
      };

      const coerceScore = (value: any): string | undefined => {
        if (value == null) {
          return undefined;
        }
        if (typeof value === 'object') {
          const record = value as Record<string, any>;
          const left = coerceText(record.team1 ?? record.teamA ?? record.left ?? record.home ?? record.first ?? record.scoreLeft ?? record.score1 ?? record.leftScore);
          const right = coerceText(record.team2 ?? record.teamB ?? record.right ?? record.away ?? record.second ?? record.scoreRight ?? record.score2 ?? record.rightScore);
          if (/\d+/.test(left) && /\d+/.test(right)) {
            return `${left.replace(/\D+/g, '')}-${right.replace(/\D+/g, '')}`;
          }
          const direct = coerceText(record.score ?? record.result ?? record.value ?? record.finalScore ?? record.points);
          const scoreMatch = direct.match(/(\d+)\s*[-:]\s*(\d+)/i);
          if (scoreMatch) {
            return `${scoreMatch[1]}-${scoreMatch[2]}`;
          }
        }
        const text = coerceText(value);
        if (!text) {
          return undefined;
        }
        const direct = text.match(/(\d+)\s*[-:]\s*(\d+)/i);
        if (direct) {
          return `${direct[1]}-${direct[2]}`;
        }
        const nested = text.match(/(\d+)\s*\(\d+\)\s*(?:\|\s*)?(\d+)\s*\(\d+\)/i) || text.match(/(\d+)\s*:\s*(\d+)/i);
        if (nested) {
          return `${nested[1]}-${nested[2]}`;
        }
        if (/^\d+$/.test(text)) {
          return `${text}-${text}`;
        }
        return undefined;
      };

      const buildBracketMatches = (round: any) => {
        const roundData = round as any;
        const matches = (roundData?.slots ?? []).map((slot: any) => {
          const slotData = slot as any;
          const matchup = slotData?.matchup ?? {};
          const scoreValue = coerceScore(matchup?.score ?? slotData?.score ?? matchup?.match?.score ?? slotData?.matchup?.score ?? slotData?.matchup?.match?.score);
          const statusValue = coerceText(matchup?.match?.status ?? slotData?.status ?? slotData?.matchup?.match?.status ?? slotData?.matchup?.status);
          const startTime = matchup?.match?.startTime ?? slotData?.matchup?.match?.startTime ?? slotData?.startTime;
          const format = matchup?.match?.numberOfMaps ? `Bo${matchup.match.numberOfMaps}` : slotData?.matchup?.match?.numberOfMaps ? `Bo${slotData.matchup.match.numberOfMaps}` : undefined;
          return {
            round: humanizeBracketRoundName(roundData?.slotId?.id || roundData?.name || roundData?.type || 'Round'),
            team1: coerceText(matchup?.team1?.name ?? matchup?.team1?.shortName ?? slotData?.slotEntry1?.description ?? slotData?.team1?.name ?? slotData?.team1?.team?.name) || undefined,
            team2: coerceText(matchup?.team2?.name ?? matchup?.team2?.shortName ?? slotData?.slotEntry2?.description ?? slotData?.team2?.name ?? slotData?.team2?.team?.name) || undefined,
            score: scoreValue,
            status: statusValue || undefined,
            matchUrl: coerceText(matchup?.match?.matchPageURL ?? slotData?.matchup?.match?.matchPageURL ?? slotData?.matchup?.match?.pageUrl ?? slotData?.pageUrl) || undefined,
            time: startTime ? new Date(startTime).toLocaleString('en-GB', {
              timeZone: 'Asia/Shanghai',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZoneName: 'short'
            }).replace(/\s+/g, ' ').trim() : undefined,
            format
          };
        }).filter((match: any) => match.team1 || match.team2 || match.score || match.matchUrl);
        return matches;
      };

      const collectBracketRoundsFromObject = (container: any): any[] => {
        if (!container || typeof container !== 'object') {
          return [];
        }

        if (Array.isArray(container.rounds)) {
          return container.rounds;
        }

        const nested: any[] = [];
        for (const [key, value] of Object.entries(container)) {
          if (key === 'display' || key === 'type' || key === 'name' || key === 'tierName' || key === 'upperTierName' || key === 'lowerTierName') {
            continue;
          }
          if (Array.isArray(value)) {
            for (const item of value) {
              nested.push(...collectBracketRoundsFromObject(item));
            }
          } else if (value && typeof value === 'object') {
            const valueData = value as any;
            if (valueData.slotId || valueData.slots || valueData.matchup || valueData.team1 || valueData.team2) {
              nested.push(valueData);
            } else {
              nested.push(...collectBracketRoundsFromObject(valueData));
            }
          }
        }
        return nested;
      };

      const renderedBracketSections = Array.from(document.querySelectorAll('.section-header'))
        .filter((header) => /playoffs|group stage/i.test(normalize(header.textContent ?? '')))
        .map((header) => {
          const sectionName = normalize(header.textContent ?? '');
          const container = header.parentElement?.querySelector('.rounds, .bracket, .bracket-wrap');
          const rounds = container ? Array.from(container.querySelectorAll(':scope > .round, .rounds > .round')) : [];
          return {
            sectionName,
            rounds
          };
        })
        .filter(({ rounds }) => rounds.length > 0)
        .flatMap(({ sectionName, rounds }) => rounds.map((roundNode) => {
          const roundName = humanizeBracketRoundName(normalize(roundNode.querySelector('.round-header, .round-title, .round-name, [data-round-name]')?.textContent ?? roundNode.getAttribute('data-round-name') ?? 'Round'));
          const matches = Array.from(roundNode.querySelectorAll('.match, .matchup, .slot'))
            .map((node) => {
              const teamNodes = Array.from(node.querySelectorAll('.team, .team-name, .teamName, .opponent'))
                .map((teamNode) => normalize(teamNode.textContent ?? ''))
                .filter(Boolean);
              const score = normalize(node.querySelector('.score, .match-score, .score-box')?.textContent ?? '');
              const time = normalize(node.querySelector('.time, .match-time')?.textContent ?? '');
              const format = normalize(node.querySelector('.format, .match-format')?.textContent ?? '');
              return {
                round: roundName,
                team1: teamNodes[0],
                team2: teamNodes[1],
                score: score || undefined,
                status: normalize(node.querySelector('.status, .match-status')?.textContent ?? ''),
                matchUrl: (node.querySelector('a') as HTMLAnchorElement | null)?.href || undefined,
                time: time || undefined,
                format: format || undefined
              };
            })
            .filter((match: any) => match.team1 || match.team2 || match.score || match.matchUrl);

          return {
            stage: sectionName,
            round: roundName,
            matches
          };
        }));

      const bracketSections: Array<{ stage: string; round: string; matches: Array<{ round: string; team1?: string; team2?: string; score?: string; status?: string; matchUrl?: string; time?: string; format?: string }> }> = [];
      for (const section of renderedBracketSections) {
        bracketSections.push(section);
      }
      const sectionHeaders = Array.from(document.querySelectorAll('.section-header'));
      for (const sectionHeader of sectionHeaders) {
        const sectionName = normalize(sectionHeader.textContent ?? '');
        if (!/playoffs|group stage/i.test(sectionName)) {
          continue;
        }

        let bracketNode: Element | null = null;
        let sibling = sectionHeader.nextElementSibling;
        while (sibling) {
          if (sibling.matches('[data-slotted-bracket-json]')) {
            bracketNode = sibling;
            break;
          }
          sibling = sibling.nextElementSibling;
        }

        if (!bracketNode) {
          continue;
        }

        try {
          const parsed = JSON.parse(bracketNode.getAttribute('data-slotted-bracket-json') || '{}');
          const rounds = collectBracketRoundsFromObject(parsed).map((round: any) => {
            const roundName = humanizeBracketRoundName(round?.slotId?.id || round?.name || round?.type || 'Round');
            const matches = buildBracketMatches(round);
            return {
              stage: sectionName,
              round: roundName,
              matches
            };
          }).filter((round: any) => round.matches.length > 0);

          bracketSections.push(...rounds);
        } catch {
          // Ignore malformed bracket payloads.
        }
      }

      return {
        date: date || undefined,
        prizePool: prizePool || undefined,
        teams: teamsText ? Number.parseInt((teamsText.match(/\d+/) ?? [])[0] || '0', 10) || undefined : undefined,
        location: location || undefined,
        currentStage: stage,
        prizeDistribution: placements,
        bracket: bracketSections,
        matches: []
      };
    });

    const media = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img, video, iframe, source, audio, embed, object'))
        .map((node) => {
          const src = (node as HTMLImageElement | HTMLMediaElement).src || (node as HTMLImageElement).getAttribute('src') || (node as HTMLImageElement).getAttribute('data-src') || '';
          return src || (node as HTMLElement).outerHTML.slice(0, 220);
        })
        .filter(Boolean)
        .slice(0, 20);
    });

    const pageTitle = await page.evaluate(() => {
      const selectors = [
        '.big-event-name',
        'h1.event-hub-title',
        '.event-header-component h1',
        '.event-name',
        '.event-header-component .text-ellipsis',
        '.event-col .col-value .text-ellipsis',
        '.text-ellipsis'
      ];

      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const text = (node?.textContent ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
        if (text && !/^(?:All events|Ongoing|Archive|Calendar|Players|Teams|Results|Matches|Overview)$/i.test(text)) {
          return { text, isBig: Boolean(document.querySelector('.big-event-name')) };
        }
      }

      return { text: '', isBig: false };
    });
    const normalizedTitle = cleanEventTitle(pageTitle.text || title || 'HLTV Event');
    const formattedTitle = pageTitle.isBig ? `[BIG] ${normalizedTitle}` : normalizedTitle;

    return {
      id: eventUrl,
      name: formattedTitle,
      url: eventUrl,
      status: /live/i.test(bodyText) ? 'live' : /upcoming|tomorrow|today|starts|scheduled|opening/i.test(bodyText) ? 'upcoming' : 'past',
      date: overview.date || undefined,
      prizePool: overview.prizePool || undefined,
      teams: overview.teams,
      location: overview.location || undefined,
      currentStage: overview.currentStage || undefined,
      matches: overview.matches,
      standings: undefined,
      prizeDistribution: overview.prizeDistribution,
      bracket: overview.bracket,
      media
    } satisfies EventSummary;
  });
}

export async function fetchMatches(progress?: (message: string, current: number, total: number) => void): Promise<MatchSummary[]> {
  progress?.('matches…', 1, 1);
  const items = await withPage(`${HLTV_BASE_URL}/matches`, async (page) => {
    return await page.$$eval('a[href*="/matches/"]', (links) => {
      const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const cleanTitleText = (value: string | number | null | undefined): string => normalizeText(value)
        .replace(/([a-z])(?=(?:an?|\d+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 ')
        .replace(/\s+\d+\s*comments?\b.*$/gi, '')
        .replace(/\s+(?:an?|[0-9]+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago.*$/gi, '')
        .replace(/#\d+$/g, '')
        .trim();
      const splitCompactTeamNames = (value: string): string[] => {
        const compact = normalizeText(value).replace(/[^A-Za-z0-9]/g, '');
        if (!compact) {
          return [];
        }
        if (compact.toLowerCase().includes('vs')) {
          return compact.split(/vs/i).flatMap((part) => splitCompactTeamNames(part)).filter(Boolean);
        }
        const splitIndex = [...compact].findIndex((char, index, chars) => {
          if (index === 0 || index === chars.length - 1) {
            return false;
          }
          const prevIsWordBoundary = /[A-Za-z0-9]/.test(chars[index - 1]);
          const prevLower = /[a-z]/.test(chars[index - 1]);
          const nextLower = /[a-z]/.test(chars[index + 1] ?? '');
          const remainingUpper = chars.slice(index + 1).length >= 2 && [...chars.slice(index + 1)].every((nextChar) => /[A-Z0-9]/.test(nextChar));
          return prevIsWordBoundary && /[A-Z]/.test(char) && (nextLower || (prevLower && remainingUpper));
        });
        if (splitIndex > 0 && splitIndex < compact.length - 1) {
          const first = compact.slice(0, splitIndex);
          const second = compact.slice(splitIndex);
          return [first, second].map((part) => normalizeText(part)).filter(Boolean);
        }
        return [compact];
      };
      const slugToReadableTitle = (slug: string): string => {
        const withoutHash = slug.replace(/#.*$/, '').trim();
        if (!withoutHash) {
          return 'HLTV';
        }
        const words = decodeURIComponent(withoutHash)
          .split('-')
          .filter(Boolean)
          .join(' ')
          .replace(/\bvs\b/gi, ' vs ')
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => {
            if (/^(mouz|nip|g2|furia|vp|vit|aurora|spirit|falcons|astral|navi|m80|ruby|ex|blast|hltv|vs)$/i.test(word)) {
              return word.toLowerCase() === 'falcons' ? 'Falcons' : word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          });
        return words.join(' ').replace(/\s+vs\s+/gi, ' vs ');
      };
      const sanitizeTeamToken = (value: string): string => normalizeText(value)
        .replace(/^(?:live\s*)+/i, '')
        .replace(/(?:\s*bo\d+)+$/i, '')
        .replace(/(?:\s*live)+$/i, '')
        .trim();
      const isEventLikeValue = (value: string): boolean => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season|games/i.test(value);
      const isLikelyTeamValue = (value: string): boolean => {
        const clean = normalizeText(value);
        if (!clean || /^bo\d+$/i.test(clean) || /^live$/i.test(clean) || /^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(clean) || /^\d+\s*:\s*\d+$/i.test(clean)) {
          return false;
        }
        return !isEventLikeValue(clean);
      };

      const extractTeamPair = (valueList: string[]): [string, string] => {
        const teamCandidates = valueList
          .filter(isLikelyTeamValue)
          .flatMap((value) => splitCompactTeamNames(value))
          .map((value) => sanitizeTeamToken(value))
          .flatMap((value) => {
            if (!value) {
              return [];
            }
            const nested = splitCompactTeamNames(value);
            return nested.length > 1 ? nested.map((part) => sanitizeTeamToken(part)) : [value];
          })
          .filter((value) => value && value.length > 2 && !/^bo\d+$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
          .filter((value, index, arr) => arr.indexOf(value) === index)
          .filter((value) => !isEventLikeValue(value));

        if (teamCandidates.length >= 2) {
          return [teamCandidates[0], teamCandidates[1]];
        }

        const fallback = valueList
          .map((value) => cleanTitleText(value))
          .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
          .filter((value, index, arr) => arr.indexOf(value) === index)
          .filter((value) => !/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value));

        return fallback.length >= 2 ? [fallback[0], fallback[1]] : ['Team A', 'Team B'];
      };

      const buildMatchLabel = (valueList: string[], href?: string): string => {
        const [firstTeam, secondTeam] = extractTeamPair(valueList);
        if (firstTeam && secondTeam && firstTeam !== 'Team A' && secondTeam !== 'Team B') {
          return `${firstTeam} vs ${secondTeam}`;
        }

        if (href) {
          const hrefTitle = slugToReadableTitle(new URL(href).pathname.split('/').filter(Boolean).slice(-1)[0] ?? '');
          if (hrefTitle && hrefTitle !== 'HLTV') {
            return hrefTitle;
          }
        }

        const cleaned = valueList
          .map((value) => cleanTitleText(value))
          .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
          .filter((value, index, arr) => arr.indexOf(value) === index);

        if (!cleaned.length) {
          return 'HLTV Match';
        }

        return cleaned.slice(0, 3).join(' · ');
      };

      const isLikelyTeamName = (value: string): boolean => {
        const text = normalizeText(value);
        if (!text || text.length < 2) {
          return false;
        }
        if (/^bo\d+$/i.test(text) || /^live$/i.test(text) || /^\d+$/i.test(text) || /^\d+\s*[-:]\s*\d+$/i.test(text)) {
          return false;
        }
        if (/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season|group|final|playoff|major/i.test(text)) {
          return false;
        }
        return !/^\s*\(\s*\)\s*$/.test(text);
      };

      const readTeamNameFromMatchLink = (link: Element, side: 'team1' | 'team2'): string | null => {
        const selectors = [
          `.match-team.${side} .match-teamname`,
          `.line-align.${side} .team`,
          `.${side} .team`,
          `.${side} .teamName`,
          `.${side} .match-teamname`,
          '.match-teamname',
          '.team'
        ];

        const orderedNames: string[] = [];
        for (const selector of selectors) {
          for (const element of Array.from(link.querySelectorAll(selector))) {
            const value = normalizeText(element.textContent ?? '');
            if (isLikelyTeamName(value) && !orderedNames.includes(value)) {
              orderedNames.push(value);
            }
          }
        }

        const nameIndex = side === 'team1' ? 0 : 1;
        return orderedNames[nameIndex] ?? null;
      };

      const extractTeamNamesFromMatchLink = (link: Element): [string, string] | null => {
        const directTeamNames = Array.from(
          new Set(
            Array.from(link.querySelectorAll('.match-teamname, .teamName, .line-align .team, .match-team .team')).map((element) => normalizeText(element.textContent ?? '')).filter(isLikelyTeamName)
          )
        );

        if (directTeamNames.length >= 2) {
          return [directTeamNames[0], directTeamNames[1]];
        }

        const team1 = readTeamNameFromMatchLink(link, 'team1');
        const team2 = readTeamNameFromMatchLink(link, 'team2');

        if (team1 && team2) {
          return [team1, team2];
        }

        const combinedText = normalizeText(link.textContent ?? '');
        const teamCandidates = splitCompactTeamNames(combinedText)
          .map((value) => normalizeText(value))
          .filter(isLikelyTeamName)
          .filter((value, index, array) => array.indexOf(value) === index);

        if (teamCandidates.length >= 2) {
          return [teamCandidates[0], teamCandidates[1]];
        }

        return null;
      };

      const byHref = new Map<string, { texts: Set<string>; teams: [string, string] | null }>();

      for (const link of Array.from(document.querySelectorAll('a.match-top, a.match-info, a.match-teams, a.match-team-livescore'))) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link.textContent || '').trim();
        if (!href || !text) {
          continue;
        }

        const existing = byHref.get(href) ?? { texts: new Set<string>(), teams: null };
        existing.texts.add(text);
        const extractedTeams = extractTeamNamesFromMatchLink(link);
        if (extractedTeams) {
          existing.teams = extractedTeams;
        }
        byHref.set(href, existing);
      }

      return Array.from(byHref.entries())
        .map(([href, payload]) => ({
          href,
          values: Array.from(payload.texts).filter((value) => value.length > 0),
          teams: payload.teams
        }))
        .filter(({ values }) => values.some((value) => value.length > 6))
        .map(({ href, values, teams }) => {
          const label = teams ? `${teams[0]} vs ${teams[1]}` : buildMatchLabel(values, href);
          const scoreText = values.find((value) => /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/i.test(value) || /\d+\s*:\s*\d+/.test(value));
          const liveScoreText = values.find((value) => /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/i.test(value) || /live/i.test(value));
          const upcomingText = values.find((value) => /\d{1,2}:\d{2}/.test(value) && !/\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/i.test(value));
          const phaseHint = liveScoreText ? 'live' : upcomingText ? 'upcoming' : 'past';
          const format = values.find((value) => /^bo\d+$/i.test(normalizeText(value))) ?? 'Bo3';
          const sanitizeTeamToken = (value: string): string => normalizeText(value)
            .replace(/^(?:live\s*)+/i, '')
            .replace(/(?:\s*bo\d+)+$/i, '')
            .replace(/(?:\s*live)+$/i, '')
            .replace(/\d+$/, '')
            .trim();
          const isEventLikeValue = (value: string): boolean => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season|games/i.test(value);
          const isLikelyTeamValue = (value: string): boolean => {
            const clean = normalizeText(value);
            if (!clean || /^bo\d+$/i.test(clean) || /^live$/i.test(clean) || /^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(clean) || /^\d+\s*:\s*\d+$/i.test(clean)) {
              return false;
            }
            return !isEventLikeValue(clean);
          };
          const teamCandidates = values
            .filter(isLikelyTeamValue)
            .flatMap((value) => splitCompactTeamNames(value))
            .map((value) => sanitizeTeamToken(value))
            .filter((value) => value && value.length > 2 && !/^bo\d+$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .filter((value) => !isEventLikeValue(value));
          const resolvedTeams: [string, string] = teams ?? (teamCandidates.length >= 2
            ? [teamCandidates[0], teamCandidates[1]]
            : ['Team A', 'Team B']);
          const event = values.find((value) => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value)) ?? 'HLTV Event';
          return {
            href,
            title: label,
            metadata: scoreText ?? 'Match info',
            phase: phaseHint,
            teams: resolvedTeams,
            format,
            event,
            score: scoreText ?? 'TBD'
          };
        });
    });
  });

  progress?.('Matches loaded', 1, 1);

  if (!items.length) {
    return [{
      id: 'match-placeholder',
      title: 'No match entries parsed yet',
      phase: 'upcoming',
      metadata: 'HLTV has no visible match rows in the current page state.',
      url: `${HLTV_BASE_URL}/matches`
    }];
  }

  return items.map((item, index) => ({
    id: slugify(`${item.href}-${index}`),
    title: item.title,
    phase: item.phase as MatchSummary['phase'],
    metadata: item.metadata,
    url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`,
    teams: item.teams,
    format: item.format,
    event: item.event,
    score: item.score
  }));
}

export async function fetchResults(progress?: (message: string, current: number, total: number) => void): Promise<MatchSummary[]> {
  progress?.('results…', 1, 1);

  const items = await withPage(`${HLTV_BASE_URL}/results`, async (page) => {
    return await page.$$eval('a[href*="/matches/"]', (links) => {
      const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const cleanTitleText = (value: string | number | null | undefined): string => normalizeText(value)
        .replace(/([a-z])(?=(?:an?|\d+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 ')
        .replace(/\s+\d+\s*comments?\b.*$/gi, '')
        .replace(/\s+(?:an?|[0-9]+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago.*$/gi, '')
        .replace(/#\d+$/g, '')
        .trim();

      const parseResultScore = (value: string): string | undefined => {
        const match = normalizeText(value).match(/(\d+)\s*-\s*(\d+)/i);
        if (match) {
          return `${match[1]}-${match[2]}`;
        }
        return undefined;
      };

      const resultEntries = new Map<string, { href: string; texts: Set<string>; teams: [string, string] | null; score?: string; event?: string; format?: string }>();

      for (const link of Array.from(links)) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link.textContent || '').trim();
        if (!href || !text) {
          continue;
        }

        const existing = resultEntries.get(href) ?? { href, texts: new Set<string>(), teams: null };
        if (text) {
          existing.texts.add(text);
        }

        const teamNames = (() => {
          const isLikelyTeamName = (value: string): boolean => {
            const text = normalizeText(value);
            if (!text || text.length < 2) {
              return false;
            }
            if (/^bo\d+$/i.test(text) || /^live$/i.test(text) || /^\d+$/i.test(text) || /^\d+\s*[-:]\s*\d+$/i.test(text)) {
              return false;
            }
            if (/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season|group|final|playoff|major/i.test(text)) {
              return false;
            }
            return !/^\s*\(\s*\)\s*$/.test(text);
          };

          const candidates = Array.from(
            new Set(
              Array.from(link.querySelectorAll('.line-align .team, .match-teamname, .teamName, .team')).map((element) => normalizeText(element.textContent ?? '')).filter(isLikelyTeamName)
            )
          );

          if (candidates.length >= 2) {
            return [candidates[0], candidates[1]] as [string, string];
          }

          const first = link.querySelector('.line-align.team1 .team, .team1 .team, .match-team.team1 .match-teamname, .team1 .teamName');
          const second = link.querySelector('.line-align.team2 .team, .team2 .team, .match-team.team2 .match-teamname, .team2 .teamName');
          const teamA = normalizeText(first?.textContent ?? '');
          const teamB = normalizeText(second?.textContent ?? '');
          if (teamA && teamB) {
            return [teamA, teamB] as [string, string];
          }

          return null;
        })();

        if (teamNames) {
          existing.teams = teamNames;
        }

        const scoreEl = link.querySelector('.result-score');
        const scoreText = scoreEl ? normalizeText(scoreEl.textContent ?? '') : undefined;
        if (scoreText) {
          existing.score = parseResultScore(scoreText) ?? scoreText;
        }

        const eventEl = link.querySelector('.event-name, .match-event .text-ellipsis, .event');
        const eventText = normalizeText(eventEl?.textContent ?? '');
        if (eventText) {
          existing.event = eventText;
        }

        const mapEl = link.querySelector('.map, .map-text');
        const formatText = normalizeText(mapEl?.textContent ?? '');
        if (formatText) {
          existing.format = formatText;
        }

        resultEntries.set(href, existing);
      }

      return Array.from(resultEntries.values())
        .filter((entry) => entry.href && entry.texts.size > 0)
        .map((entry) => {
          const label = entry.teams ? `${entry.teams[0]} vs ${entry.teams[1]}` : Array.from(entry.texts)
            .map((value) => cleanTitleText(value))
            .filter((value) => value && value.length > 3)
            .find((value) => !/^bo\d+$/i.test(value)) ?? 'HLTV Result';
          const score = entry.score ?? Array.from(entry.texts).find((value) => /\d+\s*-\s*\d+/.test(value)) ?? 'TBD';
          const event = entry.event ?? Array.from(entry.texts).find((value) => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value)) ?? 'HLTV Event';
          const format = entry.format ?? Array.from(entry.texts).find((value) => /^bo\d+$/i.test(normalizeText(value))) ?? 'Bo3';
          return {
            href: entry.href,
            title: label,
            metadata: score,
            phase: 'past' as const,
            teams: entry.teams ?? ['Team A', 'Team B'],
            format,
            event,
            score
          };
        });
    });
  });

  progress?.('Results loaded', 1, 1);

  if (!items.length) {
    return [{
      id: 'results-placeholder',
      title: 'No results parsed yet',
      phase: 'past',
      metadata: 'HLTV returned no result rows in the current page state.',
      url: `${HLTV_BASE_URL}/results`
    }];
  }

  return items.map((item, index) => ({
    id: slugify(`${item.href}-${index}`),
    title: item.title,
    phase: item.phase as MatchSummary['phase'],
    metadata: item.metadata,
    url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`,
    teams: item.teams,
    format: item.format,
    event: item.event,
    score: item.score
  }));
}

export async function fetchNews(progress?: (message: string, current: number, total: number) => void): Promise<NewsSummary[]> {
  progress?.('HLTV news list…', 0, 100);
  const items = await withPage(`${HLTV_BASE_URL}/`, async (page) => {
    progress?.('Fetching news links…', 15, 100);
    const list = await page.$$eval('a[href*="/news/"]', (links) => {
      const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const cleanTitleText = (value: string | number | null | undefined): string => normalizeText(value)
        .replace(/([a-z])(?=(?:an?|\d+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 ')
        .replace(/\s+\d+\s*comments?\b.*$/gi, '')
        .replace(/\s+(?:an?|[0-9]+)\s*(?:seconds?|minutes?|hours?|days?)\s+ago.*$/gi, '')
        .replace(/#\d+$/g, '')
        .trim();
      const slugToReadableTitle = (slug: string): string => {
        const withoutHash = slug.replace(/#.*$/, '').trim();
        if (!withoutHash) {
          return 'HLTV';
        }
        const words = decodeURIComponent(withoutHash)
          .split('-')
          .filter(Boolean)
          .join(' ')
          .replace(/\bvs\b/gi, ' vs ')
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => {
            if (/^(mouz|nip|g2|furia|vp|vit|aurora|spirit|falcons|astral|navi|m80|ruby|ex|blast|hltv|vs)$/i.test(word)) {
              return word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          });
        return words.join(' ').replace(/\s+vs\s+/gi, ' vs ');
      };
      const buildNewsLabel = (href: string, values: string[]): string => {
        const hrefTitle = slugToReadableTitle(new URL(href).pathname.split('/').filter(Boolean).slice(-1)[0] ?? '');
        if (hrefTitle && hrefTitle !== 'HLTV') {
          return hrefTitle;
        }

        const cleaned = values
          .map((value) => cleanTitleText(value))
          .filter((value) => value && value.length > 6)
          .filter((value, index, arr) => arr.indexOf(value) === index);

        return cleaned[0] ?? 'HLTV News';
      };

      const byHref = new Map<string, Set<string>>();

      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const text = (link.textContent || '').trim();
        if (!href || !text) {
          continue;
        }

        const entry = byHref.get(href) ?? new Set<string>();
        entry.add(text);
        byHref.set(href, entry);
      }

      return Array.from(byHref.entries())
        .map(([href, values]) => ({ href, values: Array.from(values) }))
        .filter(({ values }) => values.some((value) => value.length > 8))
        .map(({ href, values }) => ({
          href,
          title: buildNewsLabel(href, values),
          publishedAt: 'Today'
        }));
    });

    progress?.('Parsing news metadata…', 70, 100);
    progress?.('News list loaded', 100, 100);
    return list.map((item) => ({
      id: slugify(`${item.href}-${item.title}`),
      title: item.title,
      level: /flash|analysis|interview|short/i.test(item.title) ? 'flash' : 'headline',
      publishedAt: item.publishedAt,
      url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`
    } satisfies NewsSummary));
  });

  if (!items.length) {
    return [{
      id: 'news-placeholder',
      title: 'No news entries parsed yet',
      level: 'headline',
      publishedAt: 'Today',
      url: `${HLTV_BASE_URL}/news`
    }];
  }

  return items;
}
