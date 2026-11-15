// main.ts — token-radar-01 entrypoint.
//
// Reads the sealed snapshot, builds the signal-2 board (lib/model.ts),
// writes /output/board.json, copies dashboard/ and screenshots/ into the
// output, writes the dashboard's data file beside the page, and writes
// /output/dossier.json with the vendor library's buildDossier.
//
// Input:  --input <path>, else $MAKEFUN_INPUT_DIR/snapshot.json,
//         else /input/snapshot.json.
// Output: --output <path>, else $MAKEFUN_OUTPUT_DIR, else /output.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard, type Snapshot } from './lib/model.ts';

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function inputPath(): string {
  const fromArg = argValue('--input');
  if (fromArg) return fromArg;
  if (process.env.MAKEFUN_INPUT_DIR) return join(process.env.MAKEFUN_INPUT_DIR, 'snapshot.json');
  return '/input/snapshot.json';
}

function outputDir(): string {
  const fromArg = argValue('--output');
  if (fromArg) return fromArg;
  if (process.env.MAKEFUN_OUTPUT_DIR) return process.env.MAKEFUN_OUTPUT_DIR;
  return '/output';
}

function main(): void {
  const out = outputDir();
  const repoRoot = dirname(fileURLToPath(import.meta.url));
  const snapshot = JSON.parse(readFileSync(inputPath(), 'utf8')) as Snapshot;

  const rows = buildBoard(snapshot);
  const board = {
    model: 'signal-2',
    as_of: snapshot.as_of,
    source: snapshot.source,
    rows,
  };

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), JSON.stringify(board, null, 2) + '\n');

  const dashSrc = join(repoRoot, 'dashboard');
  const dashOut = join(out, 'dashboard');
  if (existsSync(dashSrc)) cpSync(dashSrc, dashOut, { recursive: true });
  const shotsSrc = join(repoRoot, 'screenshots');
  const shotsOut = join(out, 'screenshots');
  if (existsSync(shotsSrc)) cpSync(shotsSrc, shotsOut, { recursive: true });

  mkdirSync(dashOut, { recursive: true });
  const data = {
    model: 'signal-2',
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
  };
  writeFileSync(join(dashOut, 'zz-data.js'), 'window.RADAR_DATA = ' + JSON.stringify(data) + ';\n');

  const dossier = buildDossier(out, { text_max_bytes: 65536 });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const watch = rows.filter((r) => r.watchlist).length;
  console.log(`signal-2 board: ${rows.length} rows, ${watch} watchlist, top ${rows[0].slug} at ${rows[0].implied_value_usd}`);
}

main();
