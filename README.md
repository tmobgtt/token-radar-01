# Token Radar — signal-2

A token launch radar for make.fun's token-radar-01. `main.ts` reads the
sealed DefiLlama snapshot, ranks every protocol that records no token by an
implied launch value, gives each a seven-step farm plan, and writes a static
dashboard (`dashboard/`) plus `board.json` and `dossier.json` to the output
directory. Node 22, standard library only.

## Which protocols are on the board

Start from every protocol in the snapshot that records no token (both
`gecko_id` and `symbol` null). Screen out the ones the snapshot's own
watchlist rule treats as a wrapped, staked or bridged product of a token
that already trades, or as a venue shell:

- category is Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
  Restaked BTC or CEX;
- the name carries the whole word wrapped, staked or staking;
- the name ends in a version marker (a space, then V2, v2, 2.0 and the like);
- the name begins with an exchange's name (Binance, Coinbase, Bybit,
  Kraken, Bitget, OKX, Bitfinex or Gemini).

On this snapshot that leaves 198 protocols, including all 40 on the
watchlist. A protocol here records no token; that is DefiLlama's record,
never proof that none exists.

## The value model, signal-2

For each protocol on the board:

    implied_value_usd = round(tvl_usd * category_multiple * momentum * age * shell)

- `category_multiple` — what a launched token is worth per dollar of TVL in
  that category: Chain 0.45, Dexs 0.35, Derivatives 0.32, Lending 0.30,
  CDP 0.28, CDP Manager 0.28, Payments 0.28, Prediction Market 0.26,
  RWA 0.24, Collateral Markets 0.24, Uncollateralized Lending 0.22,
  Options Vault 0.22, Interest Rate Derivatives 0.22, OTC Marketplace 0.20,
  Crypto Card Issuer 0.20, Risk Curators 0.18, Onchain Capital Allocator
  0.18, Yield Aggregator 0.16, Yield 0.15, Liquidity Manager 0.15,
  Basis Trading 0.14, Leveraged Farming 0.12, Indexes 0.12, Insurance 0.12,
  Privacy 0.12, Cross Chain Bridge 0.12, CeDeFi 0.10, Dual-Token Stablecoin
  0.10, Decentralized BTC 0.10, Restaking 0.10, Staking Pool 0.10,
  Anchor BTC 0.08, Farm 0.08, Governance Incentives 0.08, Stablecoin
  Wrapper 0.06; any other or missing category 0.10.
- `momentum` = 1 + clamp(change_7d, -50, 100) / 200; a null change_7d
  gives 1.
- `age` = 1 + 0.05 * min(6, days between listed_at and the snapshot's
  as_of, divided by 365.25); a null listed_at gives 1.
- `shell` = 0.55 when the category is Restaking, Stablecoin Wrapper,
  Anchor BTC, Decentralized BTC, Staking Pool or Farm — wrappers and
  points shells whose TVL a native token would only partly capture —
  and 1 otherwise.

Rows sort by implied value descending, then TVL descending, then slug
ascending; ranks run 1..N. Every figure comes from the snapshot; no
protocol is valued by name.

## Farm plans

Each row carries seven steps built from its own figures: set up on its
main chain, build a core position, run its category's weekly mechanic,
extend to a second chain or deepen, review against its seven-day TVL
move, keep governance records, and hold or unwind. Position sizes come
from a TVL band table (at least $1B of TVL: $2,500 core; $250M: $1,500;
$50M: $750; $15M: $350; below: $150) and the gas budget from its chain
count (5 or more chains: $60; 3 or more: $40; 2: $25; 1: $15).

## Run it

    mkdir -p out
    MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>

The dashboard is static and renders with no network: open
`out/dashboard/index.html`. The board view filters by category and
search, sorts by any column, and every row opens a detail view showing
the model's inputs, the arithmetic and the farm plan.
