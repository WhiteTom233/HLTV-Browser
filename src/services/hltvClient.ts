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
}

export interface NewsSummary {
  id: string;
  title: string;
  level: 'headline' | 'flash';
  publishedAt: string;
  url: string;
  content?: string;
}

const HLTV_BASE_URL = 'https://www.hltv.org';

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'hltv-item';
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
      timezoneId: 'UTC',
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
  if (/(live|playing|in progress|current)/.test(text) || /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/.test(text) || /\d+\s*:\s*\d+/.test(text)) {
    return 'live';
  }

  if (/(upcoming|tomorrow|today|starts|scheduled|vs\s*\w)/.test(text) || /@\s?\d{1,2}:\d{2}/.test(text)) {
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

function readTeamNameFromMatchLink(link: Element, side: 'team1' | 'team2'): string | null {
  const selectors = [
    `.match-team.${side} .match-teamname`,
    `.line-align.${side} .team`,
    `.${side} .team`,
    `.${side} .teamName`,
    `.${side} .match-teamname`
  ];

  for (const selector of selectors) {
    const element = link.querySelector(selector);
    const value = normalizeText(element?.textContent ?? '');
    if (value) {
      return value;
    }
  }

  return null;
}

function extractTeamNamesFromMatchLink(link: Element): [string, string] | null {
  const team1 = readTeamNameFromMatchLink(link, 'team1');
  const team2 = readTeamNameFromMatchLink(link, 'team2');

  if (team1 && team2) {
    return [team1, team2] as [string, string];
  }

  if (team1 || team2) {
    const combinedText = normalizeText(link.textContent ?? '');
    const teamCandidates = splitCompactTeamNames(combinedText);
    if (teamCandidates.length >= 2) {
      return [teamCandidates[0], teamCandidates[1]] as [string, string];
    }
    return [team1 ?? team2 ?? 'Team A', team2 ?? team1 ?? 'Team B'] as [string, string];
  }

  const combinedText = normalizeText(link.textContent ?? '');
  const teamCandidates = splitCompactTeamNames(combinedText);
  if (teamCandidates.length >= 2) {
    return [teamCandidates[0], teamCandidates[1]] as [string, string];
  }

  return null;
}

function pickTeamNamesFromPage(page: Page): Promise<[string, string]> {
  return page.evaluate(() => {
    const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
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

  const statsIndex = compact.indexOf('STATS');
  if (statsIndex !== -1) {
    const beforeSummary = compact.slice(compact.indexOf(mapName) + mapName.length, statsIndex);
    const afterSummary = compact.slice(statsIndex + 'STATS'.length);
    const summaryMatch = afterSummary.match(/\(([^)]*)\)/);
    const leftScoreMatch = beforeSummary.match(/(\d+)$/);
    const rightText = afterSummary.replace(/\([^)]*\)/, '');
    const rightScoreMatch = rightText.match(/(\d+)$/);

    if (leftScoreMatch && rightScoreMatch) {
      return {
        map: mapName,
        score: `${leftScoreMatch[1]}-${rightScoreMatch[1]}`,
        summary: summaryMatch ? normalizeText(summaryMatch[1]).replace(/;\s*/g, '; ') : 'Map score history'
      };
    }
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

async function getMatchScheduleInfo(page: Page): Promise<{ dateTime?: string; date?: string; rawTime?: string } | undefined> {
  return await page.evaluate(() => {
    const timeEl = document.querySelector('.time[data-unix]');
    const dateEl = document.querySelector('.date[data-unix]');
    const rawUnix = Number(timeEl?.getAttribute('data-unix') ?? dateEl?.getAttribute('data-unix') ?? '');
    if (!Number.isFinite(rawUnix)) {
      return undefined;
    }

    const utc = new Date(rawUnix);
    const local = new Date(rawUnix + 8 * 60 * 60 * 1000);
    const iso = local.toISOString();
    return {
      dateTime: `${iso.slice(0, 10)} ${iso.slice(11, 16)} (UTC+8)`,
      date: iso.slice(0, 10),
      rawTime: `${iso.slice(11, 16)}`,
      visibleTime: timeEl?.textContent?.trim() ?? utc.toISOString().slice(11, 16),
      visibleDate: dateEl?.textContent?.trim() ?? iso.slice(0, 10)
    };
  });
}

export async function fetchMatchDetail(matchUrl: string): Promise<MatchDetail | null> {
  return await withPage(matchUrl, async (page) => {
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const text = normalizeText(bodyText);
    const teams = await pickTeamNamesFromPage(page);
    const phase: MatchSummary['phase'] = /live/i.test(bodyText) ? 'live' : /upcoming|starting|today|tomorrow|scheduled/i.test(bodyText) ? 'upcoming' : 'past';
    const schedule = await getMatchScheduleInfo(page);
    const date = schedule?.dateTime ?? bodyText.match(/\d{1,2}(?:st|nd|rd|th) of [A-Za-z]+ \d{4}/i)?.[0]
      ?? bodyText.match(/[A-Za-z]+ \d{1,2}, \d{4}/i)?.[0]
      ?? undefined;
    const event = title.includes(' at ') ? title.split(' at ')[1]?.replace(/\s+-\s+HLTV.*$/i, '') : undefined;
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

        return { map: mapName, score: 'TBD', summary: 'Map not started' };
      };

      return Array.from(document.querySelectorAll('.mapholder'))
        .map((node) => parseMapHolder((node.textContent || '').replace(/\s+/g, ' ').trim()))
        .filter((entry): entry is { map: string; score: string; summary: string } => Boolean(entry));
    });
    const score = getFinalSeriesScore(mapResults);
    const liveScore = await page.evaluate(() => {
      const liveText = document.querySelector('#scoreboardElement')?.textContent ?? document.querySelector('.scoreboard')?.textContent ?? '';
      const scoreText = (liveText || '').replace(/\s+/g, ' ').trim();
      const scoreMatch = scoreText.match(/R:\s*\d+\s*-\s*\d+.*?\d+\s*:\s*\d+/i);
      return scoreMatch ? scoreMatch[0] : undefined;
    });

    return {
      teams,
      event,
      date,
      format: bodyText.match(/Best of \d+/i)?.[0] ?? 'Bo3',
      phase,
      score,
      liveScore,
      summary: bodyText.slice(0, 280),
      mapResults
    } satisfies MatchDetail;
  });
}

export async function fetchMatches(progress?: (message: string, current: number, total: number) => void): Promise<MatchSummary[]> {
  progress?.('matches…', 1, 1);
  const items = await withPage(`${HLTV_BASE_URL}/matches`, async (page) => {
    return await page.$$eval('a[href*="/matches/"]', (links) => {
      const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const cleanTitleText = (value: string): string => normalizeText(value)
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

      const buildMatchLabel = (href: string, valueList: string[]): string => {
        const [firstTeam, secondTeam] = extractTeamPair(valueList);
        if (firstTeam && secondTeam && firstTeam !== 'Team A' && secondTeam !== 'Team B') {
          return `${firstTeam} vs ${secondTeam}`;
        }

        const hrefTitle = slugToReadableTitle(new URL(href).pathname.split('/').filter(Boolean).slice(-1)[0] ?? '');
        if (hrefTitle && hrefTitle !== 'HLTV') {
          return hrefTitle;
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
        .slice(0, 12)
        .map(({ href, values, teams }) => {
          const label = teams ? `${teams[0]} vs ${teams[1]}` : buildMatchLabel(href, values);
          const scoreText = values.find((value) => /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/i.test(value) || /\d+\s*:\s*\d+/.test(value));
          const phaseHint = values.some((value) => /live/i.test(value)) ? 'live' : scoreText ? 'live' : 'past';
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
      const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
      const cleanTitleText = (value: string): string => normalizeText(value)
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
          const first = link.querySelector('.line-align.team1 .team, .team1 .team, .match-team.team1 .match-teamname, .team1 .teamName');
          const second = link.querySelector('.line-align.team2 .team, .team2 .team, .match-team.team2 .match-teamname, .team2 .teamName');
          const teamA = normalizeText(first?.textContent ?? '');
          const teamB = normalizeText(second?.textContent ?? '');
          if (teamA && teamB) {
            return [teamA, teamB] as [string, string];
          }

          const combined = normalizeText((link.textContent || '').replace(/\s+/g, ' '));
          const compact = combined.replace(/[^A-Za-z0-9]/g, '');
          if (!compact) {
            return null;
          }
          const parts = compact.split(/vs/i); 
          if (parts.length >= 2) {
            return [normalizeText(parts[0]), normalizeText(parts[1])] as [string, string];
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
        .slice(0, 12)
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
  let items: NewsSummary[] = [];

  try {
    items = await withPage(`${HLTV_BASE_URL}/`, async (page) => {
      const list = await page.$$eval('a[href*="/news/"]', (links) => {
        const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
        const cleanTitleText = (value: string): string => normalizeText(value)
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
          .slice(0, 8)
          .map(({ href, values }) => ({
            href,
            title: buildNewsLabel(href, values),
            publishedAt: 'Today'
          }));
      });

      const total = Math.max(list.length, 1);
      const results: NewsSummary[] = [];
      for (const [index, item] of list.entries()) {
        const delayMs = 1000 + Math.floor(Math.random() * 2001);
        progress?.(`News ${index + 1} / ${total}`, index + 1, total);

        try {
          const result = await withPage(item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`, async (articlePage) => {
            await articlePage.waitForTimeout(500);
            const text = await articlePage.locator('body').innerText();
            const chunks = text
              .split(/\n+/)
              .map((value) => normalizeText(value))
              .filter(Boolean)
              .filter((value) => value.length > 14)
              .slice(0, 10);

            return {
              id: slugify(`${item.href}-${item.title}`),
              title: item.title,
              level: /flash|analysis|interview|short/i.test(item.title) ? 'flash' : 'headline',
              publishedAt: item.publishedAt,
              url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`,
              content: chunks.join('\n\n') || 'No article content could be extracted from HLTV.'
            } as NewsSummary;
          }, delayMs);

          results.push(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load article.';
          if (message.toLowerCase().includes('cloudflare')) {
            break;
          }
        }
      }

      progress?.('News loaded', total, total);
      return results;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load HLTV news.';
    if (!message.toLowerCase().includes('cloudflare')) {
      throw error;
    }
  }

  if (!items.length) {
    return [{
      id: 'news-placeholder',
      title: 'No news entries parsed yet',
      level: 'headline',
      publishedAt: 'Today',
      url: `${HLTV_BASE_URL}/news`,
      content: 'HLTV returned no news content.'
    }];
  }

  return items;
}
