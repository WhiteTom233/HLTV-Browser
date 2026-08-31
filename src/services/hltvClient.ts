import { chromium, type Page } from 'playwright';

export interface MatchSummary {
  id: string;
  title: string;
  phase: 'past' | 'live' | 'upcoming';
  metadata: string;
  url: string;
}

export interface NewsSummary {
  id: string;
  title: string;
  level: 'headline' | 'flash';
  publishedAt: string;
  url: string;
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

async function withPage<T>(url: string, callback: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);

    if (await detectCloudflare(page)) {
      throw new Error('HLTV is requesting a Cloudflare verification. Please open the HLTV page in your browser, complete the challenge, and then refresh the extension.');
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

  return cleaned.slice(0, 3).join(' · ');
}

function buildNewsLabel(values: string[]): string {
  const cleaned = values
    .map((value) => normalizeText(value))
    .filter((value) => value && value.length > 6)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return cleaned[0] ?? 'HLTV News';
}

export async function fetchMatches(): Promise<MatchSummary[]> {
  const items = await withPage(`${HLTV_BASE_URL}/matches`, async (page) => {
    return await page.$$eval('a[href*="/matches/"]', (links) => {
      const buildMatchLabel = (values: string[]): string => {
        const cleaned = values
          .map((value) => value.replace(/\s+/g, ' ').trim())
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
          return {
            href,
            title: label,
            metadata: scoreText ?? 'Match info',
            phase: phaseHint
          };
        });
    });
  });

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
    url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`
  }));
}

export async function fetchNews(): Promise<NewsSummary[]> {
  const items = await withPage(`${HLTV_BASE_URL}/news`, async (page) => {
    return await page.$$eval('a[href*="/news/"]', (links) => {
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
        .map(([href, texts]) => ({ href, values: Array.from(texts) }))
        .filter(({ values }) => values.some((value) => value.length > 8))
        .slice(0, 10)
        .map(({ href, values }) => ({
          href,
          title: buildNewsLabel(values),
          publishedAt: 'Today'
        }));
    });
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

  return items.map((item, index) => ({
    id: slugify(`${item.href}-${index}`),
    title: item.title,
    level: /flash|analysis|interview|short/i.test(item.title) ? 'flash' : 'headline',
    publishedAt: item.publishedAt,
    url: item.href.startsWith('http') ? item.href : `${HLTV_BASE_URL}${item.href}`
  }));
}
