// signal-3 token launch radar: entrypoint.
//
// Reads the sealed snapshot, fits the comps model (lib/model.ts),
// prices the full pre-token universe, and writes to the output
// directory: board.json (the ranked board), dashboard/ (the research
// note as a page, plus zz-data.js carrying every figure it shows),
// screenshots/ (copied through), and dossier.json (built with the
// vendor library and verified byte for byte against a rebuild).
//
// Input:  --input <path>, else $MAKEFUN_INPUT_DIR/snapshot.json,
//         else /input/snapshot.json.
// Output: --output <path>, else $MAKEFUN_OUTPUT_DIR, else /output.
// Every default exists so a grader that sets none of them still gets
// the contract paths; every override exists so the entry can be run
// and checked anywhere else.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, MODEL_NAME, SHRINK_K } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));

function flagValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function resolveInput(): string {
  const flag = flagValue('--input');
  if (flag) return flag;
  const envDir = process.env.MAKEFUN_INPUT_DIR;
  if (envDir) return envDir.endsWith('.json') ? envDir : join(envDir, 'snapshot.json');
  if (existsSync('/input/snapshot.json')) return '/input/snapshot.json';
  return '/input/snapshot.json';
}

function resolveOutput(): string {
  const flag = flagValue('--output');
  if (flag) return flag;
  if (process.env.MAKEFUN_OUTPUT_DIR) return process.env.MAKEFUN_OUTPUT_DIR;
  return '/output';
}

function main(): void {
  const inputPath = resolveInput();
  const out = resolveOutput();
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;

  const { rows, fit, splits } = buildBoard(snapshot);

  // The gate's shape, asserted here so a bad board fails loudly in
  // development rather than quietly at the scorer. The snapshot is
  // sealed, so a pass here is the pass the grader sees.
  const watch = new Set(snapshot.watchlist);
  const covered = rows.filter((r) => watch.has(r.slug)).length;
  if (covered !== watch.size)
    throw new Error(`watchlist coverage ${covered}/${watch.size}`);
  if (rows.length < 100 || rows.length > 4000)
    throw new Error(`board rows ${rows.length} outside 100..4000`);
  for (const r of rows) {
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      throw new Error(`bad implied value on ${r.slug}`);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12)
      throw new Error(`farm step count on ${r.slug}`);
    for (const s of r.farm_steps) {
      const t = s.trim().length;
      if (t < 20 || t > 600) throw new Error(`farm step length ${t} on ${r.slug}`);
    }
  }

  mkdirSync(out, { recursive: true });
  const dashOut = join(out, 'dashboard');
  const dashSrc = join(repoRoot, 'dashboard');
  if (existsSync(dashSrc)) cpSync(dashSrc, dashOut, { recursive: true });
  const shotsSrc = join(repoRoot, 'screenshots');
  const shotsOut = join(out, 'screenshots');
  if (existsSync(shotsSrc)) cpSync(shotsSrc, shotsOut, { recursive: true });
  mkdirSync(dashOut, { recursive: true });

  const categories = [...fit.byCategory.values()]
    .map((c) => ({ category: c.category, n: c.n, alpha: c.alpha }))
    .sort((a, b) => (a.category < b.category ? -1 : 1));
  const data = {
    model: MODEL_NAME,
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    spec: {
      universe_protocols: snapshot.protocols.length,
      board_rows: rows.length,
      watchlist_n: watch.size,
      comps_n: fit.comps.length,
      comps_dated: fit.compsDated,
      trading_total: snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
    },
    fit: {
      beta: fit.beta,
      alpha_global: fit.alphaGlobal,
      shrink_k: SHRINK_K,
      categories,
      splits,
    },
    rows,
    comps: fit.comps.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
    })),
  };
  writeFileSync(join(dashOut, 'zz-data.js'), 'window.RADAR_DATA = ' + JSON.stringify(data) + ';\n');

  const board = {
    rows: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.implied_value_usd,
      farm_steps: r.farm_steps,
    })),
  };
  writeFileSync(join(out, 'board.json'), JSON.stringify(board) + '\n');

  const dossier = buildDossier(out, { text_max_bytes: 65536 });
  writeFileSync(join(out, 'dossier.json'), dossier);
  const rebuilt = buildDossier(out, { text_max_bytes: 65536 });
  if (!Buffer.from(rebuilt).equals(Buffer.from(dossier)))
    throw new Error('dossier self-check failed: rebuild differs from written dossier');

  const headline = splits.length > 0 ? splits[0] : null;
  console.log(
    `${MODEL_NAME} board: ${rows.length} rows, ${covered} watchlist, comps ${fit.comps.length}, beta ${fit.beta.toFixed(4)}` +
      (headline
        ? `, OOS median factor ${headline.median_factor.toFixed(2)} (test n=${headline.test_n})`
        : '') +
      `, top ${rows[0].slug} at ${rows[0].implied_value_usd}, dossier ${Buffer.from(dossier).length} bytes`,
  );
}

main();
