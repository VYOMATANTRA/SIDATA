// Shared test infra for the Cerita authoring services (pages/chapters/sections/prose blocks):
// an in-memory stand-in for the models those services touch, installed onto the real `prisma`
// singleton. `$transaction(fn)` snapshots the tables and restores them if `fn` throws, so a
// test can prove "the audit row is written in the same transaction" by making the audit write
// fail and asserting the mutation rolled back with it.
//
// Only the query vocabulary the services use is implemented (equality / startsWith filters,
// the section-scope filters of the dependency counts). `select`/`include` are ignored apart
// from `_count`, which services read as `_count.chapters` / `_count.sections`.

import { Prisma } from '../../../generated/prisma/client.js';
import prisma from '../../utils/prisma.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test rows are loosely typed on purpose
type Row = Record<string, any> & { id: string };
type AnyFn = (...args: unknown[]) => unknown;

export const T0 = new Date('2026-10-01T00:00:00.000Z');

let idCounter = 0;

class Table {
  rows: Row[] = [];
  constructor(
    readonly db: FakeHierarchyDb,
    readonly name: string,
  ) {}

  private matches(row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) => {
      if (cond && typeof cond === 'object' && 'in' in cond) {
        return ((cond as { in: unknown[] }).in as unknown[]).includes(row[key]);
      }
      if (cond && typeof cond === 'object' && 'not' in cond) {
        return row[key] !== (cond as { not: unknown }).not;
      }
      if (cond === null) return row[key] === null || row[key] === undefined;
      if (cond && typeof cond === 'object' && 'startsWith' in cond) {
        return String(row[key]).startsWith((cond as { startsWith: string }).startsWith);
      }
      if (key === 'section') return this.db.sectionMatches(row.sectionId as string, cond);
      if (cond instanceof Date) return (row[key] as Date).getTime() === cond.getTime();
      return row[key] === cond;
    });
  }

  private sorted(rows: Row[], orderBy: unknown): Row[] {
    const order = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Array<
      Record<string, 'asc' | 'desc'>
    >;
    return [...rows].sort((a, b) => {
      for (const o of order) {
        const [key, dir] = Object.entries(o)[0]!;
        const av = a[key] instanceof Date ? (a[key] as Date).getTime() : a[key];
        const bv = b[key] instanceof Date ? (b[key] as Date).getTime() : b[key];
        if ((av as number) < (bv as number)) return dir === 'asc' ? -1 : 1;
        if ((av as number) > (bv as number)) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  private decorate(row: Row, include: unknown): Row {
    const out: Row = { ...row };
    const count = (include as { _count?: { select: Record<string, boolean> } } | undefined)?._count;
    if (count) {
      out._count = {};
      for (const rel of Object.keys(count.select)) {
        (out._count as Record<string, number>)[rel] = this.db.countRelation(this.name, row, rel);
      }
    }
    return out;
  }

  findUnique = async (args: { where: Record<string, unknown>; include?: unknown }) => {
    const row = this.rows.find((r) => this.matches(r, args.where));
    return row ? this.decorate(row, args.include) : null;
  };

  findMany = async (args: { where?: Record<string, unknown>; orderBy?: unknown } = {}) =>
    this.sorted(
      this.rows.filter((r) => this.matches(r, args.where)),
      args.orderBy,
    ).map((r) => ({ ...r }));

  count = async (args: { where?: Record<string, unknown> } = {}) =>
    this.rows.filter((r) => this.matches(r, args.where)).length;

  create = async (args: { data: Record<string, unknown> }) => {
    const row: Row = {
      id: `${this.name}-${++idCounter}`,
      createdAt: new Date(this.db.now()),
      updatedAt: new Date(this.db.now()),
      ...args.data,
    } as Row;
    this.db.assertUnique(this.name, row);
    this.rows.push(row);
    return { ...row };
  };

  update = async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
    include?: unknown;
  }) => {
    const row = this.rows.find((r) => this.matches(r, args.where));
    if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
    const prev = (row.updatedAt as Date).getTime();
    Object.assign(row, args.data);
    // Strictly increasing updatedAt, as a real DB would give writes at distinct times.
    const next = (row.updatedAt as Date).getTime();
    row.updatedAt = new Date(next > prev ? next : prev + 1);
    this.db.assertUnique(this.name, row);
    return this.decorate(row, args.include);
  };

  updateMany = async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
    const hit = this.rows.filter((r) => this.matches(r, args.where));
    for (const row of hit) Object.assign(row, args.data);
    return { count: hit.length };
  };

  createMany = async (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => {
    let count = 0;
    for (const data of args.data) {
      const dup = this.rows.some((r) => Object.entries(data).every(([k, v]) => r[k] === v));
      if (dup && args.skipDuplicates) continue;
      this.rows.push({ id: `${this.name}-${++idCounter}`, ...data } as Row);
      count++;
    }
    return { count };
  };

  deleteMany = async (args: { where?: Record<string, unknown> } = {}) => {
    const keep = this.rows.filter((r) => !this.matches(r, args.where));
    const count = this.rows.length - keep.length;
    this.rows = keep;
    return { count };
  };

  delete = async (args: { where: Record<string, unknown> }) => {
    const idx = this.rows.findIndex((r) => this.matches(r, args.where));
    if (idx === -1)
      throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
    const [row] = this.rows.splice(idx, 1);
    this.db.cascadeDelete(this.name, row!);
    return { ...row! };
  };
}

export interface FakeHierarchyHandle {
  db: FakeHierarchyDb;
  restore: () => void;
}

export class FakeHierarchyDb {
  page = new Table(this, 'page');
  chapter = new Table(this, 'chapter');
  section = new Table(this, 'section');
  contentBlock = new Table(this, 'contentBlock');
  indicator = new Table(this, 'indicator');
  indicatorTable = new Table(this, 'indicatorTable');
  mediaAsset = new Table(this, 'mediaAsset');
  mediaAssetReference = new Table(this, 'mediaAssetReference');
  auditRows: Row[] = [];
  /** The options argument of every `$transaction` call, e.g. to assert `isolationLevel`. */
  transactionOptions: unknown[] = [];
  /** Every `$queryRaw` statement in order, e.g. to assert page → chapter lock ordering. */
  lockLog: string[] = [];
  failAudit = false;
  private clock = T0.getTime();

  now(): number {
    return this.clock;
  }

  auditLog = {
    create: async (args: { data: Record<string, unknown> }) => {
      if (this.failAudit) throw new Error('audit write failed');
      const row = { id: `audit-${++idCounter}`, ...args.data } as Row;
      this.auditRows.push(row);
      return row;
    },
  };

  private tables(): Record<string, Table> {
    return {
      page: this.page,
      chapter: this.chapter,
      section: this.section,
      contentBlock: this.contentBlock,
      indicator: this.indicator,
      indicatorTable: this.indicatorTable,
      mediaAsset: this.mediaAsset,
      mediaAssetReference: this.mediaAssetReference,
    };
  }

  sectionMatches(sectionId: string, cond: unknown): boolean {
    const section = this.section.rows.find((s) => s.id === sectionId);
    if (!section) return false;
    const c = cond as { id?: string; chapterId?: string; chapter?: { pageId: string } };
    if (c.id !== undefined) return section.id === c.id;
    if (c.chapterId !== undefined) return section.chapterId === c.chapterId;
    if (c.chapter) {
      const chapter = this.chapter.rows.find((ch) => ch.id === section.chapterId);
      return chapter?.pageId === c.chapter.pageId;
    }
    return true;
  }

  countRelation(model: string, row: Row, rel: string): number {
    if (model === 'page' && rel === 'chapters')
      return this.chapter.rows.filter((c) => c.pageId === row.id).length;
    if (model === 'chapter' && rel === 'sections')
      return this.section.rows.filter((s) => s.chapterId === row.id).length;
    return 0;
  }

  assertUnique(model: string, row: Row): void {
    const clash = (pred: (r: Row) => boolean) =>
      this.tables()[model]!.rows.some((r) => r !== row && pred(r));
    const violation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    if (model === 'page' && clash((r) => r.slug === row.slug)) throw violation();
    if (model === 'chapter' && clash((r) => r.pageId === row.pageId && r.slug === row.slug))
      throw violation();
    if (model === 'section' && clash((r) => r.chapterId === row.chapterId && r.slug === row.slug))
      throw violation();
    if (model === 'contentBlock' && clash((r) => r.slug === row.slug)) throw violation();
  }

  /** ON DELETE CASCADE page → chapters → sections; RESTRICT elsewhere is asserted by the services. */
  cascadeDelete(model: string, row: Row): void {
    if (model === 'page') {
      for (const ch of this.chapter.rows.filter((c) => c.pageId === row.id)) {
        this.chapter.rows.splice(this.chapter.rows.indexOf(ch), 1);
        this.cascadeDelete('chapter', ch);
      }
    }
    if (model === 'chapter') {
      this.section.rows = this.section.rows.filter((s) => s.chapterId !== row.id);
    }
  }

  async $queryRaw(sql: Prisma.Sql): Promise<unknown[]> {
    this.lockLog.push(sql.sql.replace(/\s+/g, ' ').trim());
    const text = sql.sql;
    const [value] = sql.values as string[];
    if (text.includes('FROM media_assets WHERE id IN')) {
      // The locking read of attachMedia/detachMedia: current column values, ids as bound.
      return this.mediaAsset.rows
        .filter((a) => (sql.values as string[]).includes(a.id))
        .map((a) => ({
          id: a.id,
          purpose: a.purpose,
          attachedAt: a.attachedAt ?? null,
          detachedAt: a.detachedAt ?? null,
          cleanupClaimedAt: a.cleanupClaimedAt ?? null,
          cleanupQuarantineReason: a.cleanupQuarantineReason ?? null,
        }));
    }
    if (text.includes('SELECT page_id FROM chapters')) {
      const r = this.chapter.rows.find((c) => c.id === value);
      return r ? [{ page_id: r.pageId }] : [];
    }
    if (text.includes('SELECT chapter_id FROM sections')) {
      const r = this.section.rows.find((s) => s.id === value);
      return r ? [{ chapter_id: r.chapterId }] : [];
    }
    if (text.includes('SELECT section_id FROM content_blocks')) {
      const r = this.contentBlock.rows.find((b) => b.slug === value);
      return r ? [{ section_id: r.sectionId }] : [];
    }
    if (text.includes('SELECT id FROM pages WHERE slug')) {
      const r = this.page.rows.find((p) => p.slug === value);
      return r ? [{ id: r.id }] : [];
    }
    return [];
  }

  snapshot(): string {
    const t = this.tables();
    return JSON.stringify({
      rows: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.rows])),
      audit: this.auditRows,
    });
  }

  restoreSnapshot(snap: string): void {
    const parsed = JSON.parse(snap, (_k, v) =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? new Date(v) : v,
    ) as { rows: Record<string, Row[]>; audit: Row[] };
    for (const [k, v] of Object.entries(this.tables())) v.rows = parsed.rows[k]!;
    this.auditRows = parsed.audit;
  }

  // -- seeding helpers -------------------------------------------------------------------
  addPage(overrides: Partial<Row> = {}): Row {
    const row = {
      id: 'page-1',
      slug: 'kependudukan',
      title: 'Kependudukan',
      sortOrder: 0,
      createdAt: T0,
      updatedAt: T0,
      ...overrides,
    } as Row;
    this.page.rows.push(row);
    return row;
  }

  addChapter(overrides: Partial<Row> = {}): Row {
    const row = {
      id: 'ch-1',
      pageId: 'page-1',
      slug: 'jumlah-penduduk',
      number: null,
      title: 'Jumlah Penduduk',
      sortOrder: 0,
      createdAt: T0,
      updatedAt: T0,
      ...overrides,
    } as Row;
    this.chapter.rows.push(row);
    return row;
  }

  addSection(overrides: Partial<Row> = {}): Row {
    const row = {
      id: 'sec-1',
      chapterId: 'ch-1',
      slug: 'ringkasan',
      title: 'Ringkasan',
      sortOrder: 0,
      createdAt: T0,
      updatedAt: T0,
      ...overrides,
    } as Row;
    this.section.rows.push(row);
    return row;
  }

  addMedia(overrides: Partial<Row> = {}): Row {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      purpose: 'cerita',
      kind: 'photo',
      attachedAt: null,
      detachedAt: null,
      cleanupClaimedAt: null,
      cleanupQuarantineReason: null,
      createdAt: T0,
      ...overrides,
    } as Row;
    this.mediaAsset.rows.push(row);
    return row;
  }

  addBlock(overrides: Partial<Row> = {}): Row {
    const row = {
      id: 'blk-1',
      sectionId: 'sec-1',
      type: 'prose',
      slug: 'pendahuluan',
      title: 'Pendahuluan',
      body: 'Isi pendahuluan.',
      metadata: null,
      sortOrder: 0,
      updatedById: null,
      createdAt: T0,
      updatedAt: T0,
      ...overrides,
    } as Row;
    this.contentBlock.rows.push(row);
    return row;
  }
}

export function installFakeHierarchyDb(): FakeHierarchyHandle {
  const db = new FakeHierarchyDb();
  const target = prisma as unknown as Record<string, unknown>;
  const names = [
    'page',
    'chapter',
    'section',
    'contentBlock',
    'indicator',
    'indicatorTable',
    'mediaAsset',
    'mediaAssetReference',
    'auditLog',
    '$transaction',
    '$queryRaw',
  ] as const;
  const originals = names.map((n) => [n, target[n]] as const);

  for (const n of [
    'page',
    'chapter',
    'section',
    'contentBlock',
    'indicator',
    'indicatorTable',
    'mediaAsset',
    'mediaAssetReference',
  ] as const) {
    target[n] = db[n];
  }
  target.auditLog = db.auditLog;
  target.$queryRaw = ((sql: Prisma.Sql) => db.$queryRaw(sql)) as AnyFn;
  target.$transaction = (async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
    db.transactionOptions.push(options);
    const snap = db.snapshot();
    // The "tx" is the db itself, so model getters resolve to the same tables.
    const tx = {
      page: db.page,
      chapter: db.chapter,
      section: db.section,
      contentBlock: db.contentBlock,
      indicator: db.indicator,
      indicatorTable: db.indicatorTable,
      mediaAsset: db.mediaAsset,
      mediaAssetReference: db.mediaAssetReference,
      auditLog: db.auditLog,
      $queryRaw: (sql: Prisma.Sql) => db.$queryRaw(sql),
    };
    try {
      return await fn(tx);
    } catch (err) {
      db.restoreSnapshot(snap);
      throw err;
    }
  }) as AnyFn;

  return {
    db,
    restore() {
      for (const [n, v] of originals) target[n] = v;
    },
  };
}
