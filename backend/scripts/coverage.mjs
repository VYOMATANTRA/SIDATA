// Runs the backend test suite with Node's built-in coverage reporter, then strips
// src/__tests__/** and generated/** rows out of the printed report.
//
// Why this exists instead of just `--test-coverage-exclude`: that flag needs Node >=22.6,
// but the pinned dev Node here is older, and either way the flag isn't guaranteed across
// every contributor's toolchain. Filtering the text report works on any Node version that
// supports --experimental-test-coverage at all.
//
// The report's own "all files" aggregate line is dropped rather than recomputed — Node
// only prints percentages, not the underlying line/branch/func counts, so a weighted
// average can't be reconstructed from this output. Showing a fabricated number would be
// worse than showing none; read the per-file rows above instead.

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve(import.meta.dirname, '../src');

function findTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const EXCLUDE_PREFIXES = [
  path.resolve(import.meta.dirname, '../src/__tests__'),
  path.resolve(import.meta.dirname, '../generated'),
];

function isExcludedRow(line) {
  const file = line.slice(2, line.indexOf('|')).trim();
  if (!file) return false;
  const resolved = path.resolve(import.meta.dirname, '..', file);
  return EXCLUDE_PREFIXES.some((prefix) => resolved.startsWith(prefix));
}

const testFiles = findTestFiles(srcDir);

const repoRoot = path.resolve(import.meta.dirname, '..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');

const child = spawn(
  tsxBin,
  [
    '--import',
    './src/__tests__/setupEnv.ts',
    '--test',
    '--experimental-test-coverage',
    ...testFiles,
  ],
  { cwd: repoRoot, stdio: ['inherit', 'pipe', 'inherit'] },
);

let buffered = '';
child.stdout.on('data', (chunk) => {
  buffered += chunk;
});

child.on('close', (code) => {
  const lines = buffered.split('\n');
  for (const line of lines) {
    const isCoverageRow = line.startsWith('# ') && line.includes('|');
    const isAllFilesRow = isCoverageRow && line.trimStart().startsWith('# all files');
    if (isCoverageRow && !isAllFilesRow && isExcludedRow(line)) continue;
    if (isAllFilesRow) {
      console.log(
        '# all files (src only, excluding __tests__/generated — see per-file rows above)',
      );
      continue;
    }
    console.log(line);
  }
  process.exit(code ?? 1);
});
