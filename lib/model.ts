// signal-3 — a token launch radar priced like a research note, not a
// hunch.
//
// Method, in one paragraph. The board is the full pre-token universe of
// the snapshot: every protocol that records no token, minus the house's
// wrapper screen (a wrapped, staked or bridged product of a token that
// already trades is not a launch that has not happened), which leaves
// 198 protocols including all 40 on the watchlist. Each is priced off
// the snapshot's own trading tokens: a calibration set of operating
// protocols whose tokens trade (venue tokens, staking receipts and
// bridge claims are excluded, because their market cap per TVL dollar
// is not a price for an operating protocol's future token). On that set
// we fit, in logs, market cap against TVL: one pooled slope, one
// intercept per category taken as the median residual and shrunk
// toward the global median intercept with weight K = 6, so a category
// with two exemplars borrows strength from the whole market instead of
// shouting. The fit is validated out of sample on time splits (fit on
// tokens DefiLlama listed before a date, price the ones listed after;
// the walk-forward table ships in the dashboard's method panel). The
// shipped model is that same fit re-run on the full calibration set.
// A capture factor of 0.55 applies to wrapper and shell categories,
// whose TVL mostly belongs to an underlying asset a native token could
// only partly capture. Nothing is priced by name; momentum, age and
// chain count are reported as context and drive the farm plans, never
// the price.
//
// Farm plans are netted to the dollar: every step carries its own gas
// or fee figure from the plan's own numbers, and the plan closes with
// the summed net cost of running it over its horizon against the
// capital it keeps working.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export const MODEL_NAME = 'signal-3';
export const SHRINK_K = 6;
export const CAPTURE_SHELL = 0.55;

// Categories whose tokens are not a price for an operating protocol's
// future token: exchange venue tokens, staking and restaking receipts,
// bridge claims, token lockers, stablecoin wrappers and BTC anchors.
// Their market caps track an underlying asset or a venue, not a
// protocol business, so they stay out of the calibration set.
export const COMPS_EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Liquid Staking',
  'Liquid Restaking',
  'Canonical Bridge',
  'Bridge',
  'Cross Chain Bridge',
  'Restaked BTC',
  'Token Locker',
  'Stablecoin Wrapper',
  'Dual-Token Stablecoin',
  'Anchor BTC',
  'Decentralized BTC',
]);

// Categories whose TVL mostly belongs to an underlying asset: a native
// token, if one ever exists, captures only part of it.
const SHELL_CATEGORIES = new Set([
  'Restaking',
  'Stablecoin Wrapper',
  'Anchor BTC',
  'Decentralized BTC',
  'Staking Pool',
  'Dual-Token Stablecoin',
  'Farm',
]);

// The house's wrapper screen for the board itself, restated from the
// snapshot's own watchlist rule.
const BOARD_EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_HEADS = [
  'binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini',
];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

export function isScreenedOut(p: Protocol): boolean {
  if (p.category !== null && BOARD_EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPER_WORD.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  const head = p.name.toLowerCase().split(/\s+/)[0];
  if (EXCHANGE_HEADS.includes(head)) return true;
  return false;
}

export function categoryOf(p: Protocol): string {
  return p.category ?? 'Unclassified';
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(listedAt + 'T00:00:00Z');
  const b = Date.parse(asOf + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---- the fit -------------------------------------------------------------

export interface CategoryAlpha {
  category: string;
  n: number; // calibration tokens behind this intercept
  alpha: number; // shrunk median residual, in log space
}

export interface Fit {
  beta: number; // pooled slope of log(mcap) on log(TVL)
  alphaGlobal: number; // global median residual, the fallback intercept
  byCategory: Map<string, CategoryAlpha>;
  comps: Protocol[]; // the calibration set the fit ran on
  compsDated: number; // of those, how many carry a listed_at date
}

function fitCore(tokens: Protocol[], k: number): { beta: number; alphaGlobal: number; byCategory: Map<string, CategoryAlpha> } {
  const xs = tokens.map((p) => Math.log(p.tvl_usd));
  const ys = tokens.map((p) => Math.log(p.mcap_usd as number));
  const n = tokens.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const beta = sxy / sxx;
  const resid = tokens.map((p, i) => ys[i] - beta * xs[i]);
  const alphaGlobal = median(resid);
  const byCat = new Map<string, number[]>();
  tokens.forEach((p, i) => {
    const c = categoryOf(p);
    const arr = byCat.get(c);
    if (arr) arr.push(resid[i]);
    else byCat.set(c, [resid[i]]);
  });
  const byCategory = new Map<string, CategoryAlpha>();
  for (const [c, arr] of byCat) {
    const m = median(arr);
    byCategory.set(c, {
      category: c,
      n: arr.length,
      alpha: (arr.length * m + k * alphaGlobal) / (arr.length + k),
    });
  }
  return { beta, alphaGlobal, byCategory };
}

export function calibrationSet(snapshot: Snapshot): Protocol[] {
  return snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      !COMPS_EXCLUDED_CATEGORIES.has(categoryOf(p)),
  );
}

export function fitComps(snapshot: Snapshot): Fit {
  const comps = calibrationSet(snapshot);
  const core = fitCore(comps, SHRINK_K);
  return {
    ...core,
    comps,
    compsDated: comps.filter((p) => p.listed_at !== null).length,
  };
}

export function alphaFor(fit: Fit, category: string): CategoryAlpha {
  const hit = fit.byCategory.get(category);
  if (hit) return hit;
  return { category, n: 0, alpha: fit.alphaGlobal };
}

export function captureFor(category: string): number {
  return SHELL_CATEGORIES.has(category) ? CAPTURE_SHELL : 1;
}

export function priceOf(
  p: Protocol,
  fit: Fit,
): { value: number; fitted: number; alpha: CategoryAlpha; capture: number } {
  const category = categoryOf(p);
  const alpha = alphaFor(fit, category);
  const fitted = Math.exp(alpha.alpha + fit.beta * Math.log(p.tvl_usd));
  const capture = captureFor(category);
  return { value: Math.max(1, Math.round(fitted * capture)), fitted, alpha, capture };
}

// ---- out-of-sample validation -------------------------------------------

export interface SplitResult {
  label: string;
  train_n: number;
  test_n: number;
  beta: number;
  median_factor: number; // median of max(pred/actual, actual/pred)
  within_2: number; // share of test tokens priced within a factor of 2
  within_3: number;
}

function scoreSplit(
  label: string,
  train: Protocol[],
  test: Protocol[],
): SplitResult {
  const core = fitCore(train, SHRINK_K);
  const factors = test.map((p) => {
    const a = core.byCategory.get(categoryOf(p));
    const alpha = a ? a.alpha : core.alphaGlobal;
    const pred = Math.exp(alpha + core.beta * Math.log(p.tvl_usd));
    return Math.exp(Math.abs(Math.log(pred / (p.mcap_usd as number))));
  });
  factors.sort((a, b) => a - b);
  return {
    label,
    train_n: train.length,
    test_n: test.length,
    beta: core.beta,
    median_factor: factors[Math.floor(factors.length / 2)],
    within_2: factors.filter((f) => f <= 2).length / factors.length,
    within_3: factors.filter((f) => f <= 3).length / factors.length,
  };
}

// Time splits only: a token joins the training side strictly by the day
// DefiLlama first tracked it, so no future information can leak into a
// fit that prices it. Tokens with no listed_at cannot be placed in
// time and take no part in validation (they do take part in the
// shipped fit, which prices the past, not the future).
export function evaluateSplits(snapshot: Snapshot): SplitResult[] {
  const dated = calibrationSet(snapshot).filter((p) => p.listed_at !== null);
  const splits: SplitResult[] = [];
  const byDate = (cut: string) => ({
    train: dated.filter((p) => (p.listed_at as string) < cut),
    test: dated.filter((p) => (p.listed_at as string) >= cut),
  });
  const a = byDate('2023-06-01');
  if (a.train.length >= 10 && a.test.length >= 10)
    splits.push(scoreSplit('Fit on listings before 2023-06-01, priced on those listed after', a.train, a.test));
  const b = byDate('2024-06-01');
  if (b.train.length >= 10 && b.test.length >= 10)
    splits.push(scoreSplit('Fit on listings before 2024-06-01, priced on those listed after', b.train, b.test));
  for (const year of ['2024', '2025', '2026']) {
    const train = dated.filter((p) => (p.listed_at as string) < `${year}-01-01`);
    const test = dated.filter(
      (p) => (p.listed_at as string) >= `${year}-01-01` && (p.listed_at as string) < `${Number(year) + 1}-01-01`,
    );
    if (train.length >= 10 && test.length >= 3)
      splits.push(scoreSplit(`Walk-forward: fit before ${year}, priced on ${year} listings`, train, test));
  }
  return splits;
}

// ---- farm plans, netted to the dollar ------------------------------------

// Round-trip gas for one meaningful on-chain action, by the chain the
// action happens on. Cost data, not protocol data: it prices the
// reader's own transactions.
const CHAIN_GAS_USD: Record<string, number> = {
  Ethereum: 18,
  Bitcoin: 14,
  Solana: 1,
  BSC: 1,
  Tron: 2,
  Sui: 1,
  Aptos: 1,
  Avalanche: 2,
  Polygon: 1,
  Fantom: 1,
  Near: 1,
  Cosmos: 1,
  Osmosis: 1,
};
const L2_CHAINS = new Set([
  'Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle',
  'Blast', 'Mode', 'Taiko', 'Starknet', 'Manta', 'Zora',
]);

export function gasForChain(chain: string): number {
  if (CHAIN_GAS_USD[chain] !== undefined) return CHAIN_GAS_USD[chain];
  if (L2_CHAINS.has(chain)) return 1;
  return 3;
}

export function coreSizeFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 2500;
  if (tvlUsd >= 250_000_000) return 1500;
  if (tvlUsd >= 50_000_000) return 750;
  if (tvlUsd >= 15_000_000) return 350;
  return 150;
}

export interface PlanEconomics {
  core_usd: number;
  second_usd: number;
  capital_usd: number; // core + second surface, recoverable working capital
  gas_usd: number; // every gas figure in the steps, summed over the horizon
  fees_usd: number; // bridge and swap allowances
  net_cost_usd: number; // gas + fees: what running the plan actually costs
  weekly_minutes: number;
  horizon_days: number;
  weeks: number;
}

export interface FarmPlan {
  steps: string[];
  economics: PlanEconomics;
}

interface PlanContext {
  name: string;
  mainChain: string;
  core: number;
  gas: number;
}

type Playbook = {
  core: (c: PlanContext) => string;
  weekly: (c: PlanContext) => string;
};

const GENERIC: Playbook = {
  core: (c) =>
    `Open the core position: put $${c.core} to work in ${c.name}'s flagship product on ${c.mainChain}, the position its TVL is built on; start at this size and no larger until the mechanics are familiar. Cost: about $${c.gas} gas. Time: about 1 hour.`,
  weekly: (c) =>
    `work the position on ${c.mainChain}: one deliberate transaction (a deposit top-up, a claim, or a rebalance) so the wallet builds a steady history with ${c.name} rather than a single burst. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
};

const PLAYBOOKS: Record<string, Playbook> = {
  Lending: {
    core: (c) =>
      `Open the core position: supply $${c.core} of the main asset on ${c.mainChain} as collateral in ${c.name}; borrow nothing in the first week, then optionally loop to at most 30% loan-to-value once the supply side is familiar. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `run the lending loop: check the health factor, top the collateral up if it drifts, and claim any supply rewards ${c.name} shows; one maintenance pass keeps the position active in the protocol's records. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  Dexs: {
    core: (c) =>
      `Open the core position: provide $${c.core} of liquidity to ${c.name}'s deepest pair on ${c.mainChain}, split evenly across both sides; if ranges are offered, keep the position inside the active band rather than chasing the widest spread. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `tend the pool position: collect the week's fees, check the position is still in range, and rebalance only when it has drifted out; small steady volume through ${c.name}'s own router adds to the same history. Cost: about $${c.gas} a week. Time: 25 minutes a week.`,
  },
  CDP: {
    core: (c) =>
      `Open the core position: open a vault in ${c.name} on ${c.mainChain} with $${c.core} of collateral and mint its stablecoin at no more than half the liquidation threshold, so a bad week cannot force a liquidation. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `watch the vault: check the collateral ratio against the week's price move, repay a slice of the minted debt or add collateral when it tightens, and keep the vault's activity spread over time. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'CDP Manager': {
    core: (c) =>
      `Open the core position: route $${c.core} of collateral through ${c.name}'s managed vault on ${c.mainChain} at a conservative setting, letting the manager hold the collateral ratio while you learn its reporting. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `review the managed position: read the manager's rebalancing notes, confirm the collateral ratio is inside its band, and add or withdraw a small tranche rather than moving the whole position at once. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  Derivatives: {
    core: (c) =>
      `Open the core position: fund a ${c.name} account on ${c.mainChain} with $${c.core} of margin and trade small perpetual positions, maker orders first, never more than a fifth of the margin at risk on one idea. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `build a trading record: a few modest, deliberate trades through ${c.name}, sized to survive being wrong; steady volume over months is the history a launch rewards, not one large week. Cost: about $${c.gas} a week plus trading fees. Time: 40 minutes a week.`,
  },
  Yield: {
    core: (c) =>
      `Open the core position: deposit $${c.core} into ${c.name}'s flagship yield vault on ${c.mainChain}; read what the vault holds before depositing, since the yield is only as good as its underlying positions. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `compound on cadence: harvest whatever the vault has earned and restake it into the same position; if the vault offers several strategies, keep the balance in the flagship rather than scattering it. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'Yield Aggregator': {
    core: (c) =>
      `Open the core position: deposit $${c.core} into the highest-TVL vault ${c.name} runs on ${c.mainChain}; the aggregator routes it onward, so note which underlying protocol actually holds the funds. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `harvest and restake: claim the aggregated rewards and put them back into the same vault, and glance at the routing to catch a strategy change early. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  RWA: {
    core: (c) =>
      `Open the core position: complete ${c.name}'s onboarding on ${c.mainChain} (identity checks where the product requires them) and subscribe $${c.core} to its main real-world-asset series or vault. Cost: about $${c.gas} gas plus onboarding. Time: about 2 hours, most of it onboarding.`,
    weekly: (c) =>
      `stay current: read the asset reports ${c.name} publishes, confirm distributions landed, and add a small tranche when a new series opens rather than concentrating in one maturity. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  'Risk Curators': {
    core: (c) =>
      `Open the core position: allocate $${c.core} to the flagship vault ${c.name} curates on ${c.mainChain}; a curator's vault is a managed lending position, so read its risk parameters and caps before depositing. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `follow the curator: read ${c.name}'s market updates, watch for cap changes or new markets in the vault, and rebalance only when the curator's own allocation shifts materially. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  'Onchain Capital Allocator': {
    core: (c) =>
      `Open the core position: allocate $${c.core} through ${c.name}'s main allocation vault on ${c.mainChain}; note which underlying markets the allocator is funding, because that is where the position's risk actually sits. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `track the allocation: check the vault's utilisation and rate, and claim or restake distributions as they appear; small steady deposits build a longer record than one large one. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'Basis Trading': {
    core: (c) =>
      `Open the core position: fund $${c.core} into ${c.name}'s basis strategy on ${c.mainChain}, split between the spot leg and the hedge as the product directs; the position is meant to be market-neutral, so verify both legs are live. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `check the hedge: confirm the funding rate the strategy harvests is still positive and both legs remain balanced; if funding flips negative at two checks in a row, halve the position. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  Chain: {
    core: (c) =>
      `Open the core position: bridge $${c.core} onto ${c.name}'s chain, keep a working gas balance in its native token, and put the rest into the chain's flagship lending or DEX protocol so the funds are active, not idle. Cost: about $${c.gas} gas plus the bridge fee. Time: about 1 hour.`,
    weekly: (c) =>
      `be a resident, not a visitor: transact on the chain every week (a swap, a supply, a claim) across at least two of its native protocols, so the wallet reads as an early user of ${c.name} itself. Cost: about $${c.gas} a week. Time: 25 minutes a week.`,
  },
  'Prediction Market': {
    core: (c) =>
      `Open the core position: fund $${c.core} on ${c.mainChain} and take small positions in ${c.name}'s most liquid markets, sized so no single outcome costs more than a tenth of the stake. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `trade the calendar: work through the week's new markets, provide quotes or liquidity where ${c.name} offers it, and settle finished positions promptly so the account history stays continuous. Cost: about $${c.gas} a week. Time: 30 minutes a week.`,
  },
  Payments: {
    core: (c) =>
      `Open the core position: activate ${c.name}'s payment product on ${c.mainChain} and route $${c.core} of ordinary balances through it, so the account holds real balances rather than a token gesture. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `use it as money: make the week's ordinary payments and transfers through ${c.name} where accepted, and keep a balance parked between uses; payment products reward transaction history, not deposits alone. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'Crypto Card Issuer': {
    core: (c) =>
      `Open the core position: order and activate the ${c.name} card, load it with $${c.core} of working balance on ${c.mainChain}, and make the first purchases in the same week the card arrives. Cost: about $${c.gas} gas plus any card fee. Time: about 1 hour once the card lands.`,
    weekly: (c) =>
      `spend through the card: route everyday purchases through ${c.name} and top the balance up regularly; card products measure farming in transactions and volume over time, not in a single load. Cost: everyday spend only. Time: 10 minutes a week.`,
  },
  'Options Vault': {
    core: (c) =>
      `Open the core position: deposit $${c.core} into ${c.name}'s flagship options vault on ${c.mainChain} before its weekly epoch locks; vault shares are priced per epoch, so note the entry round. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `roll with the epochs: let each epoch settle, review the vault's realised result, and restake the proceeds into the next round rather than withdrawing between epochs. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'Interest Rate Derivatives': {
    core: (c) =>
      `Open the core position: put $${c.core} into ${c.name}'s main rate market on ${c.mainChain}, splitting between the fixed and floating side only once both are understood; small size first. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `mind the maturities: check open positions against the week's rate move, roll anything near expiry, and keep a note of which side of the market the wallet has been active on. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  Insurance: {
    core: (c) =>
      `Open the core position: stake $${c.core} into ${c.name}'s cover pool on ${c.mainChain}, or buy a small cover on a protocol actually used elsewhere in the portfolio; read the claim conditions before staking. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `stay staked and informed: check the pool's capacity and any claim events; insurance positions are slow by design, and continuity is the record that matters. Cost: about $${c.gas} a week. Time: 10 minutes a week.`,
  },
  Privacy: {
    core: (c) =>
      `Open the core position: fund a fresh wallet on ${c.mainChain} and make a first modest shielded transfer of about $${Math.max(50, Math.floor(c.core / 3))} through ${c.name}, learning its note and proof flow at small size. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `use it steadily: one or two ordinary private transfers through ${c.name}, of everyday size; privacy tools reward genuine repeated use, and erratic large movements help no one. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  Indexes: {
    core: (c) =>
      `Open the core position: buy $${c.core} of ${c.name}'s flagship index on ${c.mainChain} and hold it as a position, not a trade; note the basket's constituents and its rebalancing rule at entry. Cost: about $${c.gas} gas. Time: about 30 minutes.`,
    weekly: (c) =>
      `add on schedule: a small regular purchase into the same index keeps the wallet's history regular; check the basket after each rebalance to know what is actually held. Cost: about $${c.gas} a week plus the tranche. Time: 10 minutes a week.`,
  },
  'Liquidity Manager': {
    core: (c) =>
      `Open the core position: deposit $${c.core} into ${c.name}'s managed liquidity vault on ${c.mainChain}; the manager holds the range, so the homework is reading its strategy and fee history before depositing. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `review the managed range: confirm the vault is still earning fees net of rebalances, and add or withdraw in small tranches at epoch boundaries rather than mid-range. Cost: about $${c.gas} a week. Time: 15 minutes a week.`,
  },
  'Leveraged Farming': {
    core: (c) =>
      `Open the core position: open the smallest leveraged loop ${c.name} offers on ${c.mainChain} with $${c.core} of equity, at the lowest leverage tier; leveraged positions are monitored positions, so set alerts before opening. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `guard the health factor: check the position's liquidation distance at least twice a week, deleverage early when it tightens, and harvest rewards only when the health factor is comfortable. Cost: about $${c.gas} a week. Time: 30 minutes a week.`,
  },
  'Uncollateralized Lending': {
    core: (c) =>
      `Open the core position: lend $${c.core} into ${c.name}'s main pool on ${c.mainChain} only after reading the borrower disclosures for that pool; uncollateralized lending is credit, and the pool's paperwork is the product. Cost: about $${c.gas} gas. Time: about 2 hours, most of it reading.`,
    weekly: (c) =>
      `follow the borrowers: read pool updates and repayment news, and diversify into a second pool only once the first has repaid a full cycle. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  'OTC Marketplace': {
    core: (c) =>
      `Open the core position: register on ${c.name}, complete its verification, and post or accept a first small trade of about $${Math.max(50, Math.floor(c.core / 3))} so the account has a settled trade on its record. Cost: about $${c.gas} gas plus trade spread. Time: about 1 hour.`,
    weekly: (c) =>
      `work the order flow: check ${c.name}'s listings, take small well-priced trades when they appear, and keep settlement prompt; marketplaces rank accounts by completed, undisputed trades. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  'Cross Chain Bridge': {
    core: (c) =>
      `Open the core position: route about $${Math.max(50, Math.floor(c.core / 2))} through ${c.name} across two of its busiest corridors, in both directions, so the wallet has genuine bridge history rather than a single hop. Cost: about $${c.gas} gas plus bridge fees. Time: about 1 hour.`,
    weekly: (c) =>
      `keep the corridors warm: one modest bridge through ${c.name}, varying the route; bridge records are counted in routes and repetitions, not in one large transfer. Cost: about $${c.gas} a week plus fees. Time: 15 minutes a week.`,
  },
  CeDeFi: {
    core: (c) =>
      `Open the core position: deposit $${c.core} into ${c.name}'s flagship earn product on ${c.mainChain}, choosing the flexible term first so the exit is understood before any lock-up is considered. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `check the term sheet: confirm the rate being paid matches the product's published terms, and roll or withdraw at term boundaries rather than breaking terms mid-way. Cost: about $${c.gas} a week. Time: 10 minutes a week.`,
  },
  'Governance Incentives': {
    core: (c) =>
      `Open the core position: acquire and stake $${c.core} of the governance-eligible position ${c.name} tracks on ${c.mainChain}, and register for its incentive programme in the same session. Cost: about $${c.gas} gas. Time: about 45 minutes.`,
    weekly: (c) =>
      `vote and show up: read each proposal ${c.name} surfaces, vote with the staked position, and keep a note of participation; incentive programmes pay for a record of governance, not for a balance alone. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
  'Collateral Markets': {
    core: (c) =>
      `Open the core position: post $${c.core} of collateral into ${c.name}'s main market on ${c.mainChain} and take the smallest position it enables, learning its margin and liquidation rules at safe size. Cost: about $${c.gas} gas. Time: about 1 hour.`,
    weekly: (c) =>
      `mind the margin: check collateral coverage against the week's prices, top up early rather than late, and keep positions small enough that a margin call is an errand, not an emergency. Cost: about $${c.gas} a week. Time: 20 minutes a week.`,
  },
};

function cadenceFor(change7d: number | null): { word: string; minutes: number } {
  if (change7d !== null && change7d >= 15)
    return { word: 'twice a week while its TVL is running hot', minutes: 45 };
  if (change7d !== null && change7d <= -10)
    return { word: 'every two weeks, a light touch while its TVL is shrinking', minutes: 10 };
  return { word: 'once a week', minutes: 25 };
}

export function farmPlan(p: Protocol, asOf: string): FarmPlan {
  const category = categoryOf(p);
  const mainChain = p.chains[0] ?? 'Ethereum';
  const secondChain = p.chains.length > 1 ? p.chains[1] : null;
  const core = coreSizeFor(p.tvl_usd);
  const second = Math.round(core * 0.4);
  const gas = gasForChain(mainChain);
  const gasSecond = secondChain !== null ? gasForChain(secondChain) : gas;
  const days = ageDays(p.listed_at, asOf);
  const years = days === null ? null : days / 365.25;
  const horizon = years === null ? 60 : years < 1 ? 45 : years < 3 ? 90 : 150;
  const weeks = Math.ceil(horizon / 7);
  const cadence = cadenceFor(p.change_7d);
  const ctx: PlanContext = { name: p.name, mainChain, core, gas };
  const book = PLAYBOOKS[category] ?? GENERIC;

  // The plan's own ledger. Every dollar figure printed in the steps
  // below comes from these numbers, and the closing step prints their
  // sum: the plan is netted to the dollar from its own line items.
  const gasSetup = gas;
  const gasCore = gas;
  const gasWeeklyTotal = gas * weeks;
  const gasSecondTotal = gasSecond * 2;
  const gasExit = gas * 2;
  const feesBridge = secondChain !== null ? 6 : 0;
  const feesSwap = Math.max(1, Math.round(core * 0.003));
  const gasTotal = gasSetup + gasCore + gasWeeklyTotal + gasSecondTotal + gasExit;
  const feesTotal = feesBridge + feesSwap;
  const economics: PlanEconomics = {
    core_usd: core,
    second_usd: second,
    capital_usd: core + second,
    gas_usd: gasTotal,
    fees_usd: feesTotal,
    net_cost_usd: gasTotal + feesTotal,
    weekly_minutes: cadence.minutes + 25,
    horizon_days: horizon,
    weeks,
  };
  const chgText =
    p.change_7d === null
      ? 'DefiLlama reports no 7-day TVL change for it'
      : `its TVL moved ${p.change_7d >= 0 ? '+' : ''}${p.change_7d}% in the last 7 days`;
  const steps: string[] = [
    `Set up on ${mainChain}: create a fresh wallet for ${p.name}, fund it with about $${gas * 4} of gas money, and bookmark the official app, docs and announcements channel; never follow links from replies or direct messages. Cost: $${gasSetup} in gas. Time: about 30 minutes, once.`,
    book.core(ctx),
    `Repeat the mechanic ${cadence.word}: ${book.weekly(ctx)}`,
    secondChain !== null
      ? `Open the second surface: bridge about $${second} to ${secondChain}, where ${p.name} also runs, and repeat the core mechanic there at the smaller size; two chains of history are worth more than one chain twice as large. Cost: $${gasSecondTotal} in gas plus a $${feesBridge} bridge fee. Time: about 1 hour, once.`
      : `Deepen instead of spreading: ${p.name} runs only on ${mainChain}, so add about $${second} to the core position from a second wallet; two wallets with steady history beat one wallet with a single large deposit. Cost: $${gasSecondTotal} in gas. Time: about 30 minutes, once.`,
    `Keep the record: log every transaction (date, hash, balance after) in a simple sheet, and vote in ${p.name}'s governance whenever a poll opens; points and launch allocations are computed from history, and a log is the only proof kept offline. Cost: $0. Time: 10 minutes a week.`,
    `Review against the signal: ${chgText}; re-check the position whenever TVL falls more than 20% in a week, and if a token, points programme or claim is announced, act inside 48 hours: announcements are where farmed history converts. Cost: $0. Time: 15 minutes a week.`,
    `Hold for about ${horizon} days, then decide with fresh eyes: if a token has launched, claim only from a contract address published in ${p.name}'s official channels and verify it on the chain explorer before signing; if nothing has launched, unwind in tranches over a week. Cost: $${gasExit} in gas to exit. Netted plan total: $${economics.net_cost_usd} of gas and fees over ${weeks} weeks to keep $${economics.capital_usd} of capital working. Time: about 1 hour, at the end.`,
  ];
  return { steps, economics };
}

// ---- the board -----------------------------------------------------------

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  rank: number;
  implied_value_usd: number;
  fitted_value_usd: number; // the comps fit before the capture factor
  alpha: number;
  alpha_n: number; // calibration tokens behind this row's category intercept
  capture: number;
  farm_steps: string[];
  plan: PlanEconomics;
}

export interface Board {
  rows: BoardRow[];
  fit: Fit;
  splits: SplitResult[];
}

export function buildBoard(snapshot: Snapshot): Board {
  const fit = fitComps(snapshot);
  const splits = evaluateSplits(snapshot);
  const watch = new Set(snapshot.watchlist);
  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (p.gecko_id !== null || p.symbol !== null) continue; // a token already trades
    if (isScreenedOut(p) && !watch.has(p.slug)) continue; // wrapper screen; the watchlist is a floor
    const priced = priceOf(p, fit);
    const plan = farmPlan(p, snapshot.as_of);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: categoryOf(p),
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(p.listed_at, snapshot.as_of),
      watchlist: watch.has(p.slug),
      rank: 0,
      implied_value_usd: priced.value,
      fitted_value_usd: Math.round(priced.fitted),
      alpha: priced.alpha.alpha,
      alpha_n: priced.alpha.n,
      capture: priced.capture,
      farm_steps: plan.steps,
      plan: plan.economics,
    });
  }
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return { rows, fit, splits };
}
