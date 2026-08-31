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

function buildMatchLabel(values: string[]): string {
  const cleaned = values
    .map((value) => normalizeText(value))
    .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
    .filter((value, index, arr) => arr.indexOf(value) === index);

  if (cleaned.length === 0) {
    return 'HLTV Match';
  }

  const event = cleaned.find((value) => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value)) ?? cleaned[0];
  const format = values.find((value) => /^bo\d+$/i.test(normalizeText(value))) ?? 'Bo3';
  const teams = cleaned.filter((value) => value !== event).slice(0, 2);
  const teamText = teams.length >= 2 ? `${teams[0]} vs ${teams[1]}` : cleaned.slice(0, 2).join(' vs ');

  return `${teamText} · ${format} · ${event}`;
}

function buildNewsLabel(values: string[]): string {
  const cleaned = values
    .map((value) => normalizeText(value))
    .filter((value) => value && value.length > 6)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return cleaned[0] ?? 'HLTV News';
}

export async function fetchMatches(progress?: (message: string, current: number, total: number) => void): Promise<MatchSummary[]> {
  progress?.('matches…', 1, 1);
  const items = await withPage(`${HLTV_BASE_URL}/matches`, async (page) => {
    return await page.$$eval('a[href*="/matches/"]', (links) => {
      const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

      const buildMatchLabel = (values: string[]): string => {
        const cleaned = values
          .map((value) => normalizeText(value))
          .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value))
          .filter((value, index, arr) => arr.indexOf(value) === index);

        if (!cleaned.length) {
          return 'HLTV Match';
        }

        return cleaned.slice(0, 3).join(' · ');
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
        .map(([href, texts]) => ({
          href,
          values: Array.from(texts).filter((value) => value.length > 0)
        }))
        .filter(({ values }) => values.some((value) => value.length > 6))
        .slice(0, 12)
        .map(({ href, values }) => {
          const label = buildMatchLabel(values);
          const scoreText = values.find((value) => /\d+\s*\(\d+\)\s*\d+\s*\(\d+\)/i.test(value) || /\d+\s*:\s*\d+/.test(value));
          const phaseHint = values.some((value) => /live/i.test(value)) ? 'live' : scoreText ? 'live' : 'past';
          const format = values.find((value) => /^bo\d+$/i.test(normalizeText(value))) ?? 'Bo3';
          const cleaned = values
            .map((value) => normalizeText(value))
            .filter((value) => value && value.length > 3 && !/^bo3$/i.test(value) && !/^live$/i.test(value) && !/^\d+\s*\(\d+\)\s*\d+\s*\(\d+\)$/i.test(value) && !/qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value));
          const teams: [string, string] = cleaned.slice(0, 2).length === 2
            ? [cleaned[0], cleaned[1]]
            : ['Team A', 'Team B'];
          const event = values.find((value) => /qualifier|league|cup|blast|esl|fissure|clutch|series|open|invite|season/i.test(value)) ?? 'HLTV Event';
          return {
            href,
            title: label,
            metadata: scoreText ?? 'Match info',
            phase: phaseHint,
            teams,
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

export async function fetchNews(progress?: (message: string, current: number, total: number) => void): Promise<NewsSummary[]> {
  let items: NewsSummary[] = [];

  try {
    items = await withPage(`${HLTV_BASE_URL}/`, async (page) => {
      const list = await page.$$eval('a[href*="/news/"]', (links) => {
        const buildNewsLabel = (values: string[]): string => {
          const cleaned = values
            .map((value) => value.replace(/\s+/g, ' ').trim())
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
            title: buildNewsLabel(values),
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
