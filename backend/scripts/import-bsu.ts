/**
 * Imports Bank Sampah Unit (BSU) map points from a JSON file that lives OUTSIDE the repo.
 *
 * The input file contains real field data (names, phone numbers in metadata, coordinates).
 * It must never be committed or pushed (AGENTS.md: "Never commit or push production data").
 *
 * Run (from backend/, after sourcing the root env so DATABASE_URL is set for Prisma):
 *   set -a && . ../.env && set +a
 *   npm run import:bsu -- --file <path> [--apply] [--replace-sample] [--allow-production]
 *
 * Without --apply this is a dry run: the plan is printed and nothing is written.
 *
 * Idempotency: each unit's `key` is stored as metadata.Kode (MySQL JSON re-sorts keys, so its position is not stable).
 * An existing bank_sampah point with the same Kode is updated in place (only changed fields are
 * sent); a missing one is created. Re-running with the same file is a no-op. Existing bsu-rt*
 * points whose Kode is not in the file are reported and never deleted.
 *
 * --replace-sample deletes the seeded sample point (id ...0002) only when its name and type still
 * match the original sample exactly; otherwise it is left alone.
 *
 * Every write goes through the maps service, which runs its own transaction and audit row per call.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import prisma from '../src/utils/prisma.js';
import {
  createSpatialPoint,
  deleteSpatialPoint,
  getSpatialPointById,
  getSpatialPoints,
  MapsServiceError,
  updateSpatialPoint,
  type SpatialPointDTO,
} from '../src/services/maps.service.js';
import type { AuditActor, AuditRequestContext } from '../src/services/audit.service.js';

const KODE = 'Kode';
const KEY_PREFIX = 'bsu-rt';
const SAMPLE_POINT_ID = '00000000-0000-0000-0000-000000000002';
const SAMPLE_POINT_NAME = 'Bank Sampah Sejahtera Manggar';
const SYSTEM_ACTOR: AuditActor = { id: null, email: 'system@sidata.internal', role: 'system' };
const REQUEST_CONTEXT: AuditRequestContext = { ipAddress: null, userAgent: 'import-bsu script' };

class ScriptError extends Error {}

// --- Input file schema --------------------------------------------------------

const unitSchema = z
  .object({
    key: z.string().regex(/^bsu-rt\d{1,3}$/, 'key must look like bsu-rt<number>'),
    rt: z.number().int().min(1).max(100),
    name: z.string().trim().min(1),
    rts: z
      .array(z.number().int().min(1).max(100))
      .min(1)
      .refine((rts) => new Set(rts).size === rts.length, 'rts must be unique'),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    metadata: z.record(z.string(), z.string()),
  })
  .refine((unit) => unit.key === `bsu-rt${unit.rt}`, 'key must be bsu-rt<rt>')
  .refine((unit) => unit.rts.includes(unit.rt), 'rts must include rt');

const fileSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  generatedAt: z.string(),
  units: z.array(unitSchema),
});

type BsuUnit = z.infer<typeof unitSchema>;

interface PointPayload {
  name: string;
  latitude: number;
  longitude: number;
  metadata: Record<string, string>;
  rts: number[];
}

type ChangeField = keyof PointPayload;

type PlanItem =
  | { action: 'create'; key: string; name: string; rt: number; payload: PointPayload }
  | {
      action: 'update';
      key: string;
      name: string;
      rt: number;
      payload: PointPayload;
      fields: ChangeField[];
      pointId: string;
    }
  | { action: 'unchanged'; key: string; name: string; rt: number }
  | { action: 'delete'; key: string; name: string; pointId: string }
  | { action: 'error'; key: string; message: string };

interface Counts {
  create: number;
  update: number;
  unchanged: number;
  delete: number;
  errors: number;
}

// --- CLI ----------------------------------------------------------------------

interface CliOptions {
  file: string;
  apply: boolean;
  replaceSample: boolean;
  allowProduction: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    file: '',
    apply: false,
    replaceSample: false,
    allowProduction: false,
  };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--file') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--'))
        throw new ScriptError('--file requires a path');
      options.file = value;
      index += 2;
      continue;
    }
    if (arg === '--apply') options.apply = true;
    else if (arg === '--replace-sample') options.replaceSample = true;
    else if (arg === '--allow-production') options.allowProduction = true;
    else throw new ScriptError(`Unknown argument: ${arg ?? ''}`);
    index += 1;
  }
  if (options.file === '') throw new ScriptError('Missing required --file <path>');
  return options;
}

// --- Input loading ------------------------------------------------------------

function semanticProblems(units: BsuUnit[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    if (seen.has(unit.key)) problems.push(`duplicate key ${unit.key}`);
    seen.add(unit.key);
    if (unit.lat === null) problems.push(`${unit.key}: lat is null`);
    if (unit.lng === null) problems.push(`${unit.key}: lng is null`);
  }
  return problems;
}

function readUnitsFile(path: string): BsuUnit[] {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new ScriptError(`Cannot read --file ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ScriptError('--file is not valid JSON');
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ScriptError(`Invalid input file:\n${lines.join('\n')}`);
  }
  const problems = semanticProblems(parsed.data.units);
  if (problems.length > 0) {
    throw new ScriptError(`Invalid input file:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
  return parsed.data.units;
}

// --- Planning -----------------------------------------------------------------

function buildPayload(unit: BsuUnit): PointPayload {
  if (unit.lat === null || unit.lng === null)
    throw new ScriptError(`${unit.key}: missing coordinates`);
  // Kode is ours: drop any Kode the file carries, then put the unit key first.
  const rest = Object.fromEntries(Object.entries(unit.metadata).filter(([k]) => k !== KODE));
  return {
    name: unit.name,
    latitude: unit.lat,
    longitude: unit.lng,
    metadata: { [KODE]: unit.key, ...rest },
    rts: unit.rts,
  };
}

function kodeOf(point: SpatialPointDTO): string | null {
  const kode = point.metadata?.[KODE];
  return typeof kode === 'string' ? kode : null;
}

function groupByKode(points: SpatialPointDTO[]): Map<string, SpatialPointDTO[]> {
  const groups = new Map<string, SpatialPointDTO[]>();
  for (const point of points) {
    const kode = kodeOf(point);
    if (kode === null) continue;
    groups.set(kode, [...(groups.get(kode) ?? []), point]);
  }
  return groups;
}

function canonicalMetadata(value: Record<string, unknown> | null): string {
  if (value === null) return 'null';
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, value[k]]),
    ),
  );
}

function sameRtSet(a: number[], b: number[]): boolean {
  return [...a].sort((x, y) => x - y).join(',') === [...b].sort((x, y) => x - y).join(',');
}

function changedFields(point: SpatialPointDTO, payload: PointPayload): ChangeField[] {
  const checks: Array<[ChangeField, boolean]> = [
    ['name', point.name !== payload.name],
    ['latitude', Math.abs(point.latitude - payload.latitude) > 1e-7],
    ['longitude', Math.abs(point.longitude - payload.longitude) > 1e-7],
    ['metadata', canonicalMetadata(point.metadata) !== canonicalMetadata(payload.metadata)],
    ['rts', !sameRtSet(point.rts, payload.rts)],
  ];
  return checks.filter(([, changed]) => changed).map(([field]) => field);
}

function planUnit(unit: BsuUnit, matches: SpatialPointDTO[]): PlanItem {
  if (matches.length > 1) {
    return {
      action: 'error',
      key: unit.key,
      message: `${matches.length} existing points share this Kode`,
    };
  }
  const payload = buildPayload(unit);
  const match = matches[0];
  if (match === undefined) {
    return { action: 'create', key: unit.key, name: unit.name, rt: unit.rt, payload };
  }
  const fields = changedFields(match, payload);
  if (fields.length === 0) {
    return { action: 'unchanged', key: unit.key, name: unit.name, rt: unit.rt };
  }
  return {
    action: 'update',
    key: unit.key,
    name: unit.name,
    rt: unit.rt,
    payload,
    fields,
    pointId: match.id,
  };
}

async function planSample(replace: boolean): Promise<PlanItem | null> {
  const sample = await getSpatialPointById(SAMPLE_POINT_ID);
  if (sample === null) {
    console.log('SAMPLE absent, nothing to remove');
    return null;
  }
  if (sample.name !== SAMPLE_POINT_NAME || sample.type !== 'bank_sampah') {
    console.log('SAMPLE modified since seeding, left in place');
    return null;
  }
  if (!replace) {
    console.log('SAMPLE present and unmodified (pass --replace-sample to delete it)');
    return null;
  }
  return { action: 'delete', key: 'SAMPLE', name: sample.name, pointId: sample.id };
}

// --- Output and execution -----------------------------------------------------

function describe(item: PlanItem): string {
  switch (item.action) {
    case 'create':
      return `CREATE ${item.key}  ${item.name}  (RT ${item.rt})`;
    case 'update':
      return `UPDATE ${item.key} ${item.name}  (RT ${item.rt})  [fields: ${item.fields.join(', ')}]`;
    case 'unchanged':
      return `UNCHANGED ${item.key}  ${item.name}  (RT ${item.rt})`;
    case 'delete':
      return `DELETE sample  ${item.name}`;
    case 'error':
      return `ERROR ${item.key}: ${item.message}`;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof MapsServiceError || error instanceof ScriptError) return error.message;
  // Other errors (e.g. Prisma) may echo SQL values, which can include metadata; do not print them.
  if (error instanceof Error)
    return `${error.name} (message suppressed to avoid printing record data)`;
  return 'unknown error';
}

async function execute(item: PlanItem): Promise<void> {
  switch (item.action) {
    case 'create':
      await createSpatialPoint(
        { ...item.payload, type: 'bank_sampah' },
        SYSTEM_ACTOR,
        REQUEST_CONTEXT,
      );
      return;
    case 'update': {
      const input = Object.fromEntries(item.fields.map((field) => [field, item.payload[field]]));
      await updateSpatialPoint(item.pointId, input, SYSTEM_ACTOR, REQUEST_CONTEXT);
      return;
    }
    case 'delete':
      await deleteSpatialPoint(item.pointId, SYSTEM_ACTOR, REQUEST_CONTEXT);
      return;
    case 'unchanged':
    case 'error':
      return;
  }
}

function countPlanned(counts: Counts, item: PlanItem): void {
  if (item.action === 'error') counts.errors += 1;
  else counts[item.action] += 1;
}

async function runPlan(items: PlanItem[], apply: boolean): Promise<Counts> {
  const counts: Counts = { create: 0, update: 0, unchanged: 0, delete: 0, errors: 0 };
  for (const item of items) {
    if (!apply || item.action === 'error' || item.action === 'unchanged') {
      console.log(describe(item));
      countPlanned(counts, item);
      continue;
    }
    try {
      await execute(item);
      console.log(describe(item));
      countPlanned(counts, item);
    } catch (error) {
      counts.errors += 1;
      const key = item.action === 'delete' ? 'SAMPLE' : item.key;
      console.log(`ERROR ${key}: ${errorMessage(error)}`);
    }
  }
  return counts;
}

// --- Entry point --------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  if (process.env.NODE_ENV === 'production' && !options.allowProduction) {
    throw new ScriptError('Refusing to run with NODE_ENV=production without --allow-production.');
  }

  const units = readUnitsFile(options.file);
  console.log(`Read ${units.length} units from --file`);

  const existing = await getSpatialPoints({ type: 'bank_sampah' });
  const groups = groupByKode(existing);
  const items: PlanItem[] = units.map((unit) => planUnit(unit, groups.get(unit.key) ?? []));

  const fileKeys = new Set(units.map((unit) => unit.key));
  for (const kode of groups.keys()) {
    if (kode.startsWith(KEY_PREFIX) && !fileKeys.has(kode))
      console.log(`NOT IN FILE ${kode} (kept)`);
  }

  const sampleItem = await planSample(options.replaceSample);
  if (sampleItem !== null) items.push(sampleItem);

  const counts = await runPlan(items, options.apply);
  const mode = options.apply ? 'applied' : 'dry run';
  console.log(
    `\nSummary: create=${counts.create} update=${counts.update} unchanged=${counts.unchanged} ` +
      `delete=${counts.delete} errors=${counts.errors} (${mode})`,
  );
  return counts.errors > 0 ? 1 : 0;
}

async function run(): Promise<void> {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`import:bsu failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await run();
