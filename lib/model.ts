// lib/model.ts — the signal-2 value model and board builder for token-radar-01.
//
// The model, exactly as documented in README.md:
//   implied_value_usd = round(tvl_usd * category_multiple * momentum * age * shell)
//   momentum = 1 + clamp(change_7d, -50, 100) / 200   (null change_7d -> 1)
//   age      = 1 + 0.05 * min(6, days(listed_at -> as_of) / 365.25)
//              (null listed_at -> 1)
//   shell    = 0.55 for a wrapper / points-shell category, else 1
// The board is every protocol that records no token and survives the shell
// screen below, sorted by implied value desc, TVL desc, slug asc.

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

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  multiple: number;
  momentum: number;
  age: number;
  shell: number;
  farm_steps: string[];
}

// Categories the house's watchlist rule itself treats as wrapped, staked or
// bridged products of something that already trades, or as venue shells.
const SCREEN_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const SHELL_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIXES = [
  'Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini',
];

// Categories that stay on the board but take the shell-risk discount: their
// TVL is an underlying asset's value, a parent system's staking pool, or
// mercenary points capital, so a native token would capture only part of it.
const SHELL_DISCOUNT_CATEGORIES = new Set([
  'Restaking',
  'Stablecoin Wrapper',
  'Anchor BTC',
  'Decentralized BTC',
  'Staking Pool',
  'Farm',
]);
export const SHELL_FACTOR = 0.55;

// What a launched token is worth per dollar of TVL, by category: highest
// where the category's fees and economy accrue to one native token, lowest
// where TVL is pass-through or mercenary.
export const CATEGORY_MULTIPLE: Record<string, number> = {
  'Chain': 0.45,
  'Dexs': 0.35,
  'Derivatives': 0.32,
  'Lending': 0.30,
  'CDP': 0.28,
  'CDP Manager': 0.28,
  'Payments': 0.28,
  'Prediction Market': 0.26,
  'RWA': 0.24,
  'Collateral Markets': 0.24,
  'Uncollateralized Lending': 0.22,
  'Options Vault': 0.22,
  'Interest Rate Derivatives': 0.22,
  'OTC Marketplace': 0.20,
  'Crypto Card Issuer': 0.20,
  'Risk Curators': 0.18,
  'Onchain Capital Allocator': 0.18,
  'Yield Aggregator': 0.16,
  'Yield': 0.15,
  'Liquidity Manager': 0.15,
  'Basis Trading': 0.14,
  'Leveraged Farming': 0.12,
  'Indexes': 0.12,
  'Insurance': 0.12,
  'Privacy': 0.12,
  'Cross Chain Bridge': 0.12,
  'CeDeFi': 0.10,
  'Dual-Token Stablecoin': 0.10,
  'Decentralized BTC': 0.10,
  'Restaking': 0.10,
  'Staking Pool': 0.10,
  'Anchor BTC': 0.08,
  'Farm': 0.08,
  'Governance Incentives': 0.08,
  'Stablecoin Wrapper': 0.06,
};
export const DEFAULT_MULTIPLE = 0.10;

export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function isShellScreened(p: Protocol): boolean {
  if (p.category !== null && SCREEN_CATEGORIES.has(p.category)) return true;
  if (SHELL_WORD.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

export function isCandidate(p: Protocol): boolean {
  return recordsNoToken(p) && !isShellScreened(p);
}

export function categoryMultiple(category: string | null): number {
  if (category === null) return DEFAULT_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_MULTIPLE;
}

export function momentumFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  const clamped = Math.max(-50, Math.min(100, change7d));
  return 1 + clamped / 200;
}

export function ageFactor(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 1;
  const days = (Date.parse(asOf) - Date.parse(listedAt)) / 86400000;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return 1 + 0.05 * Math.min(6, days / 365.25);
}

export function shellFactor(p: Protocol): number {
  return p.category !== null && SHELL_DISCOUNT_CATEGORIES.has(p.category)
    ? SHELL_FACTOR
    : 1;
}

export function impliedValue(p: Protocol, asOf: string) {
  const multiple = categoryMultiple(p.category);
  const momentum = momentumFactor(p.change_7d);
  const age = ageFactor(p.listed_at, asOf);
  const shell = shellFactor(p);
  const value = Math.round(p.tvl_usd * multiple * momentum * age * shell);
  return { value, multiple, momentum, age, shell };
}

// ---- farm plans -----------------------------------------------------------

export function money(n: number): string {
  const s = String(Math.round(n));
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function coreSize(tvl: number): number {
  if (tvl >= 1_000_000_000) return 2500;
  if (tvl >= 250_000_000) return 1500;
  if (tvl >= 50_000_000) return 750;
  if (tvl >= 15_000_000) return 350;
  return 150;
}

function gasBudget(chainCount: number): number {
  if (chainCount >= 5) return 60;
  if (chainCount >= 3) return 40;
  if (chainCount >= 2) return 25;
  return 15;
}

type Mechanic = { first: string; weekly: string };

function mechanicFor(category: string | null): Mechanic {
  switch (category) {
    case 'Dexs':
      return {
        first: 'route swaps through its pools and take a small liquidity position in its busiest pair',
        weekly: 'rebalance the liquidity position and route the week\u2019s swaps through it',
      };
    case 'Lending':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
      return {
        first: 'supply collateral to its lending markets and open one small borrow against it',
        weekly: 'roll the borrow, repay on schedule and top the collateral back to its starting ratio',
      };
    case 'Derivatives':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
      return {
        first: 'post margin and open one small position in its flagship market',
        weekly: 'roll one position and settle the week\u2019s funding instead of letting it idle',
      };
    case 'Yield':
    case 'Yield Aggregator':
    case 'Liquidity Manager':
    case 'Leveraged Farming':
    case 'Basis Trading':
    case 'Farm':
      return {
        first: 'deposit into its main vault and let the position start earning',
        weekly: 'compound the week\u2019s yield back into the same vault and re-check its rate',
      };
    case 'CDP':
    case 'CDP Manager':
    case 'Dual-Token Stablecoin':
      return {
        first: 'open a collateralised debt position and mint a small amount of its stablecoin',
        weekly: 'check the collateral ratio and repay a slice of the minted balance',
      };
    case 'Chain':
      return {
        first: 'bridge funds in and transact with the chain\u2019s native apps',
        weekly: 'keep a cadence of native transactions across at least three different apps',
      };
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return {
        first: 'allocate capital into its curated vaults, split across at least two of them',
        weekly: 'rebalance between its vaults toward the best risk-adjusted rate and compound the yield',
      };
    case 'RWA':
      return {
        first: 'complete its onboarding and buy a first tranche of its tokenised assets',
        weekly: 'hold the tranche, collect its distribution and log the payment date',
      };
    default:
      return {
        first: 'use its core product with a funded account, the way a real user would',
        weekly: 'repeat the core action so the account shows a steady weekly pattern',
      };
  }
}

export function farmSteps(p: Protocol, rank: number, implied: number): string[] {
  const core = coreSize(p.tvl_usd);
  const gas = gasBudget(p.chains.length);
  const mech = mechanicFor(p.category);
  const cat = p.category ?? 'uncategorised';
  const mainChain = p.chains[0] ?? 'Ethereum';
  const weeklyFee = Math.max(4, Math.round(core * 0.02));
  const steps: string[] = [];

  steps.push(
    `Set up for ${p.name} on ${mainChain}: connect a fresh wallet, fund it with ${money(core + gas)} ` +
    `(${money(core)} of working capital plus a ${money(gas)} gas budget), and make one small real transaction ` +
    `so the wallet has genuine history before any size goes in. Allow about 25 minutes.`,
  );

  steps.push(
    `Build the core position in ${p.name}: ${mech.first} on ${mainChain}, sized at ${money(core)} and split ` +
    `into three tranches across the first two weeks. Against its ${money(p.tvl_usd)} of TVL that is ordinary ` +
    `user flow for a ${cat} protocol, not size that moves its markets.`,
  );

  steps.push(
    `Run the weekly mechanic for ${p.name}: ${mech.weekly}. Keep it going for 8 to 12 weeks at about ` +
    `20 minutes a week; the running cost is roughly ${money(weeklyFee)} a week in fees and slippage at ` +
    `current ${cat} rates, on top of the ${money(gas)} gas budget already funded.`,
  );

  if (p.chains.length > 1) {
    steps.push(
      `Extend ${p.name} to ${p.chains[1]}: bridge ${money(Math.round(core / 2))} across (about $6 in bridge ` +
      `fees) and repeat the core position and weekly mechanic there. ${p.name} counts TVL on ` +
      `${p.chains.length} chains, and multi-chain activity is the pattern points programs usually weight most.`,
    );
  } else {
    steps.push(
      `Deepen on ${mainChain} instead of spreading thin: add a second ${money(Math.round(core / 2))} position ` +
      `in a different ${cat} market of ${p.name}, so the account shows breadth inside the one chain it ` +
      `operates on. Cost is gas only, inside the ${money(gas)} budget.`,
    );
  }

  if (p.change_7d === null) {
    steps.push(
      `Review ${p.name} monthly: the snapshot reports no seven-day TVL change for it, so judge it on TVL ` +
      `alone; if TVL falls below ${money(Math.round(p.tvl_usd / 2))}, cut the position to ` +
      `${money(Math.round(core / 4))} and wait rather than averaging down. The review takes 10 minutes.`,
    );
  } else if (p.change_7d >= 0) {
    steps.push(
      `Review ${p.name} monthly: its TVL grew ${p.change_7d}% in the seven days before the snapshot, so ` +
      `hold the full schedule while growth lasts; if TVL falls below ${money(Math.round(p.tvl_usd / 2))}, ` +
      `cut the position to ${money(Math.round(core / 4))} and wait. The review takes 10 minutes.`,
    );
  } else {
    steps.push(
      `Review ${p.name} monthly: its TVL fell ${Math.abs(p.change_7d)}% in the seven days before the ` +
      `snapshot, so start at half size (${money(Math.round(core / 2))}) and only build to the full ` +
      `${money(core)} after a month of stable TVL. The review takes 10 minutes.`,
    );
  }

  steps.push(
    `Keep records and a voice in ${p.name}: join its governance and community channels, vote on every ` +
    `proposal the position qualifies for, and keep a dated log of every transaction. It costs nothing ` +
    `but 30 minutes a month, and the log is what separates a farmer from a sybil flag if a snapshot is taken.`,
  );

  steps.push(
    `Hold ${p.name} until it publishes launch or points rules: this board ranks it ${rank} with an implied ` +
    `value of ${money(implied)}, so the ${money(core)} position is sized to be worth keeping for 6 to ` +
    `12 months. If the rules exclude your wallet, unwind over two weeks; expected exit cost is about ` +
    `${money(Math.round(core * 0.03) + Math.round(gas / 2))} in fees and slippage.`,
  );

  return steps;
}

// ---- board ----------------------------------------------------------------

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isCandidate)
    .map((p) => ({ p, iv: impliedValue(p, snapshot.as_of) }));
  scored.sort((a, b) =>
    b.iv.value - a.iv.value ||
    b.p.tvl_usd - a.p.tvl_usd ||
    (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map(({ p, iv }, i) => ({
    slug: p.slug,
    name: p.name,
    rank: i + 1,
    implied_value_usd: iv.value,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    watchlist: watch.has(p.slug),
    multiple: iv.multiple,
    momentum: iv.momentum,
    age: iv.age,
    shell: iv.shell,
    farm_steps: farmSteps(p, i + 1, iv.value),
  }));
}
