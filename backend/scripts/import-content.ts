/**
 * Option 1 API content importer for SIDATA.
 *
 * Reads a JSON content manifest (plus any local media files referenced by path) and populates
 * Cerita pages, chapters, sections, prose blocks, section figures, scalar indicators, indicator
 * tables, and optional standalone blocks through the authenticated backend API.
 *
 * Usage:
 *   npx tsx scripts/import-content.ts --file ../content-bundle/cerita-manggar-2026.json --dry-run
 *   SIDATA_REFRESH_TOKEN=... npx tsx scripts/import-content.ts --file ../content-bundle/cerita-manggar-2026.json --base-url https://sidata.example.com
 *   npx tsx scripts/import-content.ts --file ../content-bundle/cerita-manggar-2026.json --email dev-admin@example.com --password DevPassword123! --turnstile-token XXXX.DUMMY.TOKEN.XXXX
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildIndicatorRequestBody,
  computeRateLimitDelayMs,
  extractCookiesFromHeaders,
  formatCookieHeader,
  parseContentImportManifest,
  type ContentImportManifest,
  type ImportFigure,
} from '../src/utils/contentImport.js';

interface CliOptions {
  file: string;
  baseUrl: string;
  token?: string;
  refreshToken?: string;
  email?: string;
  password?: string;
  turnstileToken?: string;
  pageFilter?: string;
  overwrite: boolean;
  dryRun: boolean;
  help: boolean;
}

interface PageSummary {
  id: string;
  slug: string;
  title: string;
  chapters: Array<{
    id: string;
    slug: string;
    title: string;
    updatedAt: string;
    sections: Array<{
      id: string;
      slug: string;
      title: string | null;
      updatedAt: string;
    }>;
  }>;
}

interface ContentBlockSummary {
  id: string;
  sectionId: string | null;
  type: string;
  slug: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

interface IndicatorSummary {
  id: string;
  slug: string;
  sectionId: string;
}

interface IndicatorTableSummary {
  id: string;
  slug: string;
  sectionId: string;
  rows?: Array<{ id: string; rowKey: string }>;
}

interface ImportCounters {
  pagesCreated: number;
  chaptersCreated: number;
  sectionsCreated: number;
  proseCreated: number;
  proseUpdated: number;
  proseSkipped: number;
  figuresSaved: number;
  figuresSkipped: number;
  indicatorsCreated: number;
  indicatorsUpdated: number;
  indicatorsSkipped: number;
  tablesCreated: number;
  tablesUpdated: number;
  tablesSkipped: number;
  standaloneUpdated: number;
  standaloneSkipped: number;
  mediaUploaded: number;
}

function printHelp(): void {
  console.log(`
SIDATA API Content Importer

Options:
  --file <path>             Path to manifest JSON (required)
  --base-url <url>          Backend base URL (default: SIDATA_API_URL or http://localhost:3000)
  --token <jwt>             Access token (or env SIDATA_ACCESS_TOKEN)
  --refresh-token <token>   Refresh token cookie value (or env SIDATA_REFRESH_TOKEN; auto-refreshes)
  --email <email>           Login email (or env SIDATA_EMAIL)
  --password <password>     Login password (or env SIDATA_PASSWORD)
  --turnstile-token <tok>   Turnstile token for /api/auth/login (or env SIDATA_TURNSTILE_TOKEN)
  --page <slug>             Only import a single Cerita page slug
  --overwrite               Update existing prose blocks, indicators, tables, standalone blocks, and figures
  --dry-run                 Validate manifest & print plan without writing anything
  --help                    Show this help message
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    file: '',
    baseUrl: process.env.SIDATA_API_URL ?? 'http://localhost:3000',
    overwrite: false,
    dryRun: false,
    help: false,
  };

  if (process.env.SIDATA_ACCESS_TOKEN) opts.token = process.env.SIDATA_ACCESS_TOKEN;
  if (process.env.SIDATA_REFRESH_TOKEN) opts.refreshToken = process.env.SIDATA_REFRESH_TOKEN;
  if (process.env.SIDATA_EMAIL) opts.email = process.env.SIDATA_EMAIL;
  if (process.env.SIDATA_PASSWORD) opts.password = process.env.SIDATA_PASSWORD;
  if (process.env.SIDATA_TURNSTILE_TOKEN) opts.turnstileToken = process.env.SIDATA_TURNSTILE_TOKEN;

  const readVal = (idx: number, flag: string): string => {
    const val = argv[idx + 1];
    if (!val || val.startsWith('--')) {
      throw new Error(`Argumen ${flag} membutuhkan nilai.`);
    }
    return val;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--overwrite') {
      opts.overwrite = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--file') {
      opts.file = readVal(i, '--file');
      i++;
    } else if (arg.startsWith('--file=')) {
      opts.file = arg.slice('--file='.length);
    } else if (arg === '--base-url') {
      opts.baseUrl = readVal(i, '--base-url');
      i++;
    } else if (arg.startsWith('--base-url=')) {
      opts.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--token') {
      opts.token = readVal(i, '--token');
      i++;
    } else if (arg.startsWith('--token=')) {
      opts.token = arg.slice('--token='.length);
    } else if (arg === '--refresh-token') {
      opts.refreshToken = readVal(i, '--refresh-token');
      i++;
    } else if (arg.startsWith('--refresh-token=')) {
      opts.refreshToken = arg.slice('--refresh-token='.length);
    } else if (arg === '--email') {
      opts.email = readVal(i, '--email');
      i++;
    } else if (arg.startsWith('--email=')) {
      opts.email = arg.slice('--email='.length);
    } else if (arg === '--password') {
      opts.password = readVal(i, '--password');
      i++;
    } else if (arg.startsWith('--password=')) {
      opts.password = arg.slice('--password='.length);
    } else if (arg === '--turnstile-token') {
      opts.turnstileToken = readVal(i, '--turnstile-token');
      i++;
    } else if (arg.startsWith('--turnstile-token=')) {
      opts.turnstileToken = arg.slice('--turnstile-token='.length);
    } else if (arg === '--page') {
      opts.pageFilter = readVal(i, '--page');
      i++;
    } else if (arg.startsWith('--page=')) {
      opts.pageFilter = arg.slice('--page='.length);
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }

  opts.baseUrl = opts.baseUrl.replace(/\/+$/, '');
  return opts;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

class SidataApiClient {
  private readonly baseUrl: string;
  private readonly cookies = new Map<string, string>();
  private csrfToken: string | null = null;
  private accessToken: string | null = null;
  private tokenObtainedAt = 0;

  constructor(baseUrl: string, initialAccessToken?: string, initialRefreshToken?: string) {
    this.baseUrl = baseUrl;
    if (initialAccessToken) {
      this.accessToken = initialAccessToken;
      this.tokenObtainedAt = Date.now();
    }
    if (initialRefreshToken) {
      this.cookies.set('refreshToken', initialRefreshToken);
    }
  }

  private captureCookies(headers: Headers): void {
    const parsed = extractCookiesFromHeaders(headers);
    for (const [k, v] of Object.entries(parsed)) {
      this.cookies.set(k, v);
    }
  }

  private async rawFetch(urlPath: string, init: FetchInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookieHeader = formatCookieHeader(this.cookies);
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }
    if (this.accessToken) {
      headers.set('authorization', `Bearer ${this.accessToken}`);
    }
    const res = await fetch(`${this.baseUrl}${urlPath}`, {
      ...init,
      headers,
    });
    this.captureCookies(res.headers);
    return res;
  }

  async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const res = await this.rawFetch('/api/auth/csrf-token', { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Gagal mengambil CSRF token (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { csrfToken?: string };
    if (!data.csrfToken) {
      throw new Error('Respons /api/auth/csrf-token tidak berisi csrfToken.');
    }
    this.csrfToken = data.csrfToken;
    return this.csrfToken;
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.cookies.has('refreshToken')) return false;
    const csrf = await this.ensureCsrf();
    const res = await this.rawFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'x-csrf-token': csrf },
    });
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as { accessToken?: string };
    if (!data.accessToken) return false;
    this.accessToken = data.accessToken;
    this.tokenObtainedAt = Date.now();
    return true;
  }

  async login(email: string, password: string, turnstileToken?: string): Promise<void> {
    const csrf = await this.ensureCsrf();
    const res = await this.rawFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        email,
        password,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Login gagal (${res.status}): ${text}`);
    }
    const data = JSON.parse(text) as { accessToken?: string };
    if (!data.accessToken) {
      throw new Error('Respons login tidak berisi accessToken.');
    }
    this.accessToken = data.accessToken;
    this.tokenObtainedAt = Date.now();
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    urlPath: string,
    body?: unknown,
    isFormData = false,
  ): Promise<T> {
    // Proactively refresh before the 15-minute access token expires.
    if (
      this.accessToken &&
      this.cookies.has('refreshToken') &&
      Date.now() - this.tokenObtainedAt > 11 * 60 * 1000 &&
      urlPath !== '/api/auth/refresh'
    ) {
      await this.refreshAccessToken();
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const headers = new Headers();
      if (method !== 'GET') {
        const csrf = await this.ensureCsrf();
        headers.set('x-csrf-token', csrf);
      }
      let encodedBody: FetchInit['body'] | undefined;
      if (body !== undefined) {
        if (isFormData) {
          encodedBody = body as FormData;
        } else {
          headers.set('content-type', 'application/json');
          encodedBody = JSON.stringify(body);
        }
      }

      const res = await this.rawFetch(urlPath, {
        method,
        headers,
        ...(encodedBody !== undefined ? { body: encodedBody } : {}),
      });

      if (res.status === 429) {
        const delayMs = computeRateLimitDelayMs(res.headers);
        console.warn(
          `[rate-limit] 429 pada ${method} ${urlPath}. Menunggu ${Math.ceil(delayMs / 1000)} detik...`,
        );
        await sleep(delayMs);
        continue;
      }

      if (res.status === 401 && urlPath !== '/api/auth/refresh') {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) continue;
      }

      if (res.status === 403 && attempt === 0) {
        const errText = await res.clone().text();
        if (errText.toLowerCase().includes('csrf')) {
          this.csrfToken = null;
          continue;
        }
      }

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${method} ${urlPath} gagal (${res.status}): ${text}`);
      }
      return (text ? JSON.parse(text) : {}) as T;
    }

    throw new Error(`${method} ${urlPath} gagal setelah beberapa kali percobaan ulang.`);
  }

  async uploadMedia(localFilePath: string, purpose: string): Promise<string> {
    const fileBytes = await fs.readFile(localFilePath);
    const filename = path.basename(localFilePath);
    const form = new FormData();
    form.append('file', new Blob([fileBytes]), filename);
    form.append('purpose', purpose);
    const data = await this.request<{ asset?: { id: string }; id?: string }>(
      'POST',
      '/api/media',
      form,
      true,
    );
    const id = data.asset?.id ?? data.id;
    if (!id) {
      throw new Error(`Respons upload media tidak berisi id untuk ${localFilePath}`);
    }
    return id;
  }
}

const normalizeTitle = (title: string | null | undefined): string =>
  (title ?? '').trim().toLowerCase();

async function fetchAllIndicators(client: SidataApiClient): Promise<IndicatorSummary[]> {
  const all: IndicatorSummary[] = [];
  for (let page = 1; ; page++) {
    const res = await client.request<{
      indicators: IndicatorSummary[];
      total: number;
      pageSize: number;
    }>('GET', `/api/indicators?page=${page}&pageSize=200`);
    all.push(...res.indicators);
    if (all.length >= res.total || res.indicators.length === 0) break;
  }
  return all;
}

async function fetchAllIndicatorTables(client: SidataApiClient): Promise<IndicatorTableSummary[]> {
  const all: IndicatorTableSummary[] = [];
  for (let page = 1; ; page++) {
    const res = await client.request<{
      tables: IndicatorTableSummary[];
      total: number;
      pageSize: number;
    }>('GET', `/api/indicator-tables?page=${page}&pageSize=200`);
    all.push(...res.tables);
    if (all.length >= res.total || res.tables.length === 0) break;
  }
  return all;
}

async function resolveFigurePayload(
  client: SidataApiClient,
  manifestDir: string,
  fig: ImportFigure,
  counters: ImportCounters,
): Promise<Record<string, unknown>> {
  const resolveLocal = (p: string) => (path.isAbsolute(p) ? p : path.resolve(manifestDir, p));

  if (fig.kind === 'photo' || fig.kind === 'photos') {
    const photos = [];
    for (const p of fig.photos) {
      const mediaId = await client.uploadMedia(resolveLocal(p.filePath), 'cerita');
      counters.mediaUploaded++;
      photos.push({
        mediaId,
        alt: p.alt,
        ...(p.caption ? { caption: p.caption } : {}),
        ...(p.credit ? { credit: p.credit } : {}),
      });
    }
    return { kind: fig.kind, photos };
  }

  let image: { mediaId: string; alt: string } | undefined;
  if (fig.image) {
    const mediaId = await client.uploadMedia(resolveLocal(fig.image.filePath), 'cerita');
    counters.mediaUploaded++;
    image = { mediaId, alt: fig.image.alt };
  }

  return {
    kind: 'diagram',
    title: fig.title,
    ...(fig.source ? { source: fig.source } : {}),
    ...(image ? { image } : {}),
    ...(fig.bars ? { bars: fig.bars } : {}),
  };
}

async function runImport(manifest: ContentImportManifest, opts: CliOptions): Promise<void> {
  const manifestDir = path.dirname(path.resolve(opts.file));
  const pagesToProcess = opts.pageFilter
    ? manifest.pages.filter((p) => p.slug === opts.pageFilter)
    : manifest.pages;

  if (opts.pageFilter && pagesToProcess.length === 0) {
    throw new Error(`Halaman dengan slug "${opts.pageFilter}" tidak ditemukan di manifest.`);
  }

  const client = new SidataApiClient(opts.baseUrl, opts.token, opts.refreshToken);

  if (!opts.dryRun) {
    if (!opts.token && opts.refreshToken) {
      const ok = await client.refreshAccessToken();
      if (!ok) {
        throw new Error('Gagal memperbarui token menggunakan refresh token yang diberikan.');
      }
    } else if (!opts.token && opts.email && opts.password) {
      await client.login(opts.email, opts.password, opts.turnstileToken);
    }

    if (opts.token || opts.refreshToken || (opts.email && opts.password)) {
      const me = await client.request<{ user?: { email: string; role: string } }>(
        'GET',
        '/api/auth/me',
      );
      const role = me.user?.role;
      if (role !== 'admin' && role !== 'editor') {
        throw new Error(`Akun "${me.user?.email}" memiliki role "${role}" (butuh admin/editor).`);
      }
      console.log(`Terautentikasi sebagai ${me.user?.email} (${role}).`);
    } else {
      throw new Error(
        'Kredensial dibutuhkan untuk mode tulis. Gunakan --refresh-token, --token, atau --email + --password (atau --dry-run).',
      );
    }
  } else {
    console.log('[DRY RUN] Manifest valid. Memeriksa state server secara read-only...');
  }

  // Load current server state (public read endpoints work even in dry-run without auth).
  const pagesRes = await client.request<{ pages: PageSummary[] }>(
    'GET',
    '/api/pages?include=sections',
  );
  const blocksRes = await client.request<{ blocks: ContentBlockSummary[] }>(
    'GET',
    '/api/content-blocks',
  );
  const existingIndicators = await fetchAllIndicators(client);
  const existingTables = await fetchAllIndicatorTables(client);

  const templateIdBySlug = new Map<string, string>();
  if (!opts.dryRun || opts.token || opts.refreshToken) {
    try {
      const tplRes = await client.request<{
        templates: Array<{ id: string; slug: string }>;
      }>('GET', '/api/comparison-templates');
      for (const t of tplRes.templates) {
        templateIdBySlug.set(t.slug, t.id);
      }
    } catch (err) {
      if (!opts.dryRun) throw err;
      console.warn('[DRY RUN] Tidak dapat membaca /api/comparison-templates tanpa auth.');
    }
  }

  const pageBySlug = new Map(pagesRes.pages.map((p) => [p.slug, p]));
  const blockBySlug = new Map(blocksRes.blocks.map((b) => [b.slug, b]));
  const proseBySectionAndTitle = new Map<string, Map<string, ContentBlockSummary>>();
  const figureBlockBySection = new Map<string, ContentBlockSummary>();

  for (const b of blocksRes.blocks) {
    if (!b.sectionId) continue;
    if (b.type === 'figure') {
      figureBlockBySection.set(b.sectionId, b);
    } else {
      const byTitle =
        proseBySectionAndTitle.get(b.sectionId) ?? new Map<string, ContentBlockSummary>();
      byTitle.set(normalizeTitle(b.title), b);
      proseBySectionAndTitle.set(b.sectionId, byTitle);
    }
  }

  const indicatorBySlug = new Map(existingIndicators.map((i) => [i.slug, i]));
  const tableBySlug = new Map(existingTables.map((t) => [t.slug, t]));

  const counters: ImportCounters = {
    pagesCreated: 0,
    chaptersCreated: 0,
    sectionsCreated: 0,
    proseCreated: 0,
    proseUpdated: 0,
    proseSkipped: 0,
    figuresSaved: 0,
    figuresSkipped: 0,
    indicatorsCreated: 0,
    indicatorsUpdated: 0,
    indicatorsSkipped: 0,
    tablesCreated: 0,
    tablesUpdated: 0,
    tablesSkipped: 0,
    standaloneUpdated: 0,
    standaloneSkipped: 0,
    mediaUploaded: 0,
  };

  // Optional standalone blocks
  if (!opts.pageFilter && manifest.standaloneBlocks?.length) {
    for (const sb of manifest.standaloneBlocks) {
      const existing = blockBySlug.get(sb.slug);
      if (!existing) {
        console.warn(`[skip] Standalone block "${sb.slug}" tidak ditemukan di server.`);
        counters.standaloneSkipped++;
        continue;
      }
      if (!opts.overwrite) {
        counters.standaloneSkipped++;
        continue;
      }
      if (opts.dryRun) {
        console.log(`[dry-run] Update standalone block: ${sb.slug}`);
        counters.standaloneUpdated++;
        continue;
      }
      await client.request('PATCH', `/api/content-blocks/${sb.slug}`, {
        ...(sb.title !== undefined ? { title: sb.title } : {}),
        ...(sb.body !== undefined ? { body: sb.body } : {}),
        ...(sb.metadata !== undefined ? { metadata: sb.metadata } : {}),
        expectedUpdatedAt: existing.updatedAt,
      });
      counters.standaloneUpdated++;
    }
  }

  // Cerita hierarchy + content
  for (const pageSpec of pagesToProcess) {
    let page = pageBySlug.get(pageSpec.slug);
    if (!page) {
      const pageTitle = pageSpec.title ?? pageSpec.slug;
      if (opts.dryRun) {
        console.log(`[dry-run] Create page: ${pageSpec.slug} ("${pageTitle}")`);
        counters.pagesCreated++;
        page = { id: `dry:${pageSpec.slug}`, slug: pageSpec.slug, title: pageTitle, chapters: [] };
      } else {
        const res = await client.request<{ page: PageSummary }>('POST', '/api/pages', {
          slug: pageSpec.slug,
          title: pageTitle,
        });
        page = { ...res.page, chapters: res.page.chapters ?? [] };
        pageBySlug.set(page.slug, page);
        counters.pagesCreated++;
        console.log(`[created] Page: ${page.slug}`);
      }
    }

    if (pageSpec.coverPhoto && opts.overwrite && !opts.dryRun) {
      const detail = await client.request<{ page: { updatedAt: string } }>(
        'GET',
        `/api/pages/${page.slug}`,
      );
      const localPath = path.isAbsolute(pageSpec.coverPhoto.filePath)
        ? pageSpec.coverPhoto.filePath
        : path.resolve(manifestDir, pageSpec.coverPhoto.filePath);
      const coverAssetId = await client.uploadMedia(localPath, 'cerita-cover');
      counters.mediaUploaded++;
      await client.request('PUT', `/api/pages/${page.slug}/cover`, {
        coverAssetId,
        expectedUpdatedAt: detail.page.updatedAt,
      });
    }

    for (const chSpec of pageSpec.chapters) {
      let chapter = page.chapters.find(
        (c) => c.slug === chSpec.slug || normalizeTitle(c.title) === normalizeTitle(chSpec.title),
      );
      if (!chapter) {
        if (opts.dryRun) {
          console.log(`[dry-run] Create chapter: ${page.slug} -> "${chSpec.title}"`);
          counters.chaptersCreated++;
          chapter = {
            id: `dry:${page.slug}/${chSpec.slug}`,
            slug: chSpec.slug,
            title: chSpec.title,
            updatedAt: new Date().toISOString(),
            sections: [],
          };
        } else {
          const res = await client.request<{
            chapter: { id: string; slug: string; title: string; updatedAt: string };
          }>('POST', `/api/pages/${page.slug}/chapters`, { title: chSpec.title });
          chapter = { ...res.chapter, sections: [] };
          page.chapters.push(chapter);
          counters.chaptersCreated++;
          console.log(`[created] Chapter: ${page.slug}/${chapter.slug}`);
        }
      }

      for (const secSpec of chSpec.sections) {
        let section = chapter.sections.find(
          (s) =>
            (secSpec.slug && s.slug === secSpec.slug) ||
            normalizeTitle(s.title) === normalizeTitle(secSpec.title),
        );

        if (!section) {
          if (opts.dryRun) {
            console.log(
              `[dry-run] Create section: ${page.slug}/${chapter.slug} -> "${secSpec.title}"`,
            );
            counters.sectionsCreated++;
            section = {
              id: `dry:${chapter.slug}/${secSpec.title}`,
              slug: secSpec.slug ?? 'dry-section',
              title: secSpec.title,
              updatedAt: new Date().toISOString(),
            };
          } else {
            const res = await client.request<{
              section: { id: string; slug: string; title: string | null; updatedAt: string };
            }>('POST', `/api/chapters/${chapter.id}/sections`, { title: secSpec.title });
            section = res.section;
            chapter.sections.push(section);
            counters.sectionsCreated++;
            console.log(`[created] Section: ${page.slug}/${chapter.slug} -> "${secSpec.title}"`);
          }
        }

        // Prose blocks
        const sectionProseMap =
          proseBySectionAndTitle.get(section.id) ?? new Map<string, ContentBlockSummary>();
        for (const pb of secSpec.proseBlocks ?? []) {
          const titleKey = normalizeTitle(pb.title);
          const existingProse = sectionProseMap.get(titleKey);
          if (existingProse) {
            if (!opts.overwrite) {
              counters.proseSkipped++;
              continue;
            }
            if ((existingProse.title ?? '') === pb.title && existingProse.body === pb.body) {
              counters.proseSkipped++;
              continue;
            }
            if (opts.dryRun) {
              console.log(`[dry-run] Update prose: "${pb.title}" in "${secSpec.title}"`);
              counters.proseUpdated++;
              continue;
            }
            const res = await client.request<{ block: ContentBlockSummary }>(
              'PATCH',
              `/api/content-blocks/${existingProse.slug}`,
              {
                title: pb.title,
                body: pb.body,
                expectedUpdatedAt: existingProse.updatedAt,
              },
            );
            sectionProseMap.set(titleKey, res.block);
            counters.proseUpdated++;
            continue;
          }
          if (opts.dryRun) {
            console.log(`[dry-run] Create prose: "${pb.title}" in "${secSpec.title}"`);
            counters.proseCreated++;
            sectionProseMap.set(titleKey, {
              id: `dry:${section.id}/${titleKey}`,
              sectionId: section.id,
              type: 'prose',
              slug: `dry-${titleKey}`,
              title: pb.title,
              body: pb.body,
              metadata: null,
              updatedAt: new Date().toISOString(),
            });
            proseBySectionAndTitle.set(section.id, sectionProseMap);
            continue;
          }
          const res = await client.request<{
            block?: ContentBlockSummary;
            section: { updatedAt: string };
          }>('POST', `/api/sections/${section.id}/content-blocks`, {
            title: pb.title,
            body: pb.body,
          });
          section.updatedAt = res.section.updatedAt;
          if (res.block) {
            sectionProseMap.set(titleKey, res.block);
          }
          proseBySectionAndTitle.set(section.id, sectionProseMap);
          counters.proseCreated++;
        }

        // Section figure
        if (secSpec.figure) {
          const hasExistingFigure = figureBlockBySection.has(section.id);
          if (hasExistingFigure && !opts.overwrite) {
            counters.figuresSkipped++;
          } else if (opts.dryRun) {
            console.log(
              `[dry-run] ${hasExistingFigure ? 'Update' : 'Create'} figure (${secSpec.figure.kind}) in "${secSpec.title}"`,
            );
            counters.figuresSaved++;
          } else {
            const figurePayload = await resolveFigurePayload(
              client,
              manifestDir,
              secSpec.figure,
              counters,
            );
            const res = await client.request<{ section: { updatedAt: string } }>(
              'PUT',
              `/api/sections/${section.id}/figure`,
              {
                expectedUpdatedAt: section.updatedAt,
                figure: figurePayload,
              },
            );
            section.updatedAt = res.section.updatedAt;
            counters.figuresSaved++;
          }
        }

        // Scalar indicators
        for (const ind of secSpec.indicators ?? []) {
          const existing = indicatorBySlug.get(ind.slug);
          if (existing && !opts.overwrite) {
            counters.indicatorsSkipped++;
            continue;
          }
          if (opts.dryRun) {
            if (ind.comparisonTemplateSlug && !templateIdBySlug.has(ind.comparisonTemplateSlug)) {
              console.log(
                `[dry-run] ${existing ? 'Update' : 'Create'} indicator: ${ind.slug} (template: ${ind.comparisonTemplateSlug})`,
              );
            } else {
              console.log(`[dry-run] ${existing ? 'Update' : 'Create'} indicator: ${ind.slug}`);
            }
            if (existing) counters.indicatorsUpdated++;
            else counters.indicatorsCreated++;
            continue;
          }

          const payload = buildIndicatorRequestBody(ind, section.id, templateIdBySlug);
          if (existing) {
            await client.request('PATCH', `/api/indicators/${existing.id}`, payload);
            counters.indicatorsUpdated++;
          } else {
            const res = await client.request<{ indicator: IndicatorSummary }>(
              'POST',
              '/api/indicators',
              payload,
            );
            indicatorBySlug.set(ind.slug, res.indicator);
            counters.indicatorsCreated++;
          }
        }

        // Indicator tables
        for (const tbl of secSpec.tables ?? []) {
          const existing = tableBySlug.get(tbl.slug);
          if (existing && !opts.overwrite) {
            counters.tablesSkipped++;
            continue;
          }
          if (opts.dryRun) {
            console.log(
              `[dry-run] ${existing ? 'Update' : 'Create'} table: ${tbl.slug} (${tbl.rows.length} rows)`,
            );
            if (existing) counters.tablesUpdated++;
            else counters.tablesCreated++;
            continue;
          }

          if (!existing) {
            const res = await client.request<{ table: IndicatorTableSummary }>(
              'POST',
              '/api/indicator-tables',
              {
                sectionId: section.id,
                slug: tbl.slug,
                title: tbl.title,
                kind: tbl.kind,
                period: tbl.period,
                source: tbl.source ?? null,
                ...(tbl.sortOrder !== undefined ? { sortOrder: tbl.sortOrder } : {}),
                rows: tbl.rows,
              },
            );
            tableBySlug.set(tbl.slug, res.table);
            counters.tablesCreated++;
          } else {
            // Update header + existing matching rows in one transaction; add any new rows.
            const detail = await client.request<{
              table: { rows: Array<{ id: string; rowKey: string }> };
            }>('GET', `/api/indicator-tables/${existing.id}`);
            const rowIdByKey = new Map(detail.table.rows.map((r) => [r.rowKey, r.id]));
            const patchRows = [];
            const newRows = [];
            for (const row of tbl.rows) {
              const rowId = rowIdByKey.get(row.rowKey);
              if (rowId) {
                patchRows.push({
                  id: rowId,
                  label: row.label,
                  ...(row.male !== undefined ? { male: row.male } : {}),
                  ...(row.female !== undefined ? { female: row.female } : {}),
                  ...(row.total !== undefined ? { total: row.total } : {}),
                  ...(row.sortOrder !== undefined ? { sortOrder: row.sortOrder } : {}),
                });
              } else {
                newRows.push(row);
              }
            }
            await client.request('PATCH', `/api/indicator-tables/${existing.id}`, {
              title: tbl.title,
              period: tbl.period,
              source: tbl.source ?? null,
              ...(tbl.sortOrder !== undefined ? { sortOrder: tbl.sortOrder } : {}),
              ...(patchRows.length > 0 ? { rows: patchRows } : {}),
            });
            for (const nr of newRows) {
              await client.request('POST', `/api/indicator-tables/${existing.id}/rows`, nr);
            }
            counters.tablesUpdated++;
          }
        }
      }
    }
  }

  console.log('\nRingkasan impor konten:');
  console.log(JSON.stringify(counters, null, 2));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!opts.file) {
    printHelp();
    throw new Error('Wajib menyertakan --file <path-ke-manifest.json>.');
  }

  const rawText = await fs.readFile(path.resolve(opts.file), 'utf8');
  const rawJson = JSON.parse(rawText) as unknown;
  const manifest = parseContentImportManifest(rawJson);

  await runImport(manifest, opts);
}

main().catch((err) => {
  console.error('\nError impor konten:', err instanceof Error ? err.message : err);
  process.exit(1);
});
