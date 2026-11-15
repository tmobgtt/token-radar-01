# Token Launch Radar: the pre-token universe, priced off its own trading tokens

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tmobgtt/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/tmobgtt/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

token-radar-01 · research note · snapshot as of 2026-11-14 (DefiLlama, 758 protocols at $5M TVL and above, floor $50M)

198 protocols that record no token, each priced by a comps fit on the snapshot's own calibration tokens and given a farm plan netted to the dollar. The method is stated before the ranking it produces, and the dashboard re-runs the fit in the browser to check the board's figures.

## Method

1. **Universe.** 342 protocols in the snapshot record no token. The wrapper screen sets aside 144 wrapped, staked or bridged products of tokens that already trade, versioned names and exchange shells, leaving the board's 198 rows. The watchlist is a floor, not a ceiling: all 40 of its protocols are on the board, and so are 158 more below its $50M line.
2. **Calibration.** 128 protocols carry a trading token with a market cap. Venue tokens, staking receipts and bridge claims are excluded, because their cap per TVL dollar prices an underlying asset or a venue, not a protocol's future token. What remains is the calibration set: 87 operating protocols whose tokens actually trade (65 of them with listing dates). Excluded categories: CEX, Liquid Staking, Liquid Restaking, Canonical Bridge, Bridge, Cross Chain Bridge, Restaked BTC, Token Locker, Stablecoin Wrapper, Dual-Token Stablecoin, Anchor BTC, Decentralized BTC.
3. **The fit.** In logs, ln(market cap) = alpha_category + beta * ln(TVL), with beta = 0.4394 fitted by least squares across the calibration set. Each alpha is its category's median residual, shrunk toward the global median (alpha = 8.4220) with weight K = 6, so a category with two exemplars borrows the market's level instead of shouting; a category with none takes the global alpha.
4. **Capture and context.** Wrapper and shell categories (Restaking, Stablecoin Wrapper, Anchor BTC, Decentralized BTC, Staking Pool, Dual-Token Stablecoin, Farm) are priced at a 0.55 capture factor: their TVL mostly belongs to an underlying asset a native token could only partly capture. Momentum, age and chain count are printed as context and set each farm plan's cadence and size; they never move a price.

## Out-of-sample test

Time splits only: no fit ever sees a token listed after its test set. Factors are median multiples between fitted and actual market cap (x2.09 means the typical miss is a factor of about two, in either direction).

| Split | Train | Test | beta | Median factor | Within x2 | Within x3 |
| --- | --- | --- | --- | --- | --- | --- |
| Fit on listings before 2023-06-01, priced on those listed after | 18 | 47 | 0.417 | x2.09 | 45% | 57% |
| Fit on listings before 2024-06-01, priced on those listed after | 30 | 35 | 0.528 | x2.77 | 37% | 54% |
| Walk-forward: fit before 2024, priced on 2024 listings | 25 | 12 | 0.515 | x2.38 | 42% | 58% |
| Walk-forward: fit before 2025, priced on 2025 listings | 37 | 20 | 0.488 | x2.22 | 45% | 65% |
| Walk-forward: fit before 2026, priced on 2026 listings | 57 | 8 | 0.347 | x7.69 | 13% | 25% |

Limits, plainly: a comps price claims what a token would be worth if the protocol's record stayed as it is; it does not claim a token will exist. The 2026 walk-forward cell is the weakest (n = 8) because a newly listed token's cap has not settled; the headline split prices 47 later listings at a median factor of x2.09.

## Top of the board

| Rank | Protocol | Category | TVL | Implied value |
| --- | --- | --- | --- | --- |
| 1 | Sentora Curator | Risk Curators | $2,757,585,593 | $82,634,344 |
| 2 | Steakhouse Financial | Risk Curators | $2,753,981,495 | $82,586,871 |
| 3 | Gauntlet | Risk Curators | $1,577,685,462 | $64,655,275 |
| 4 | Polymarket International | Prediction Market | $320,193,439 | $61,705,389 |
| 5 | Veda | Onchain Capital Allocator | $1,563,415,482 | $41,732,206 |
| 6 | Nonce Capital | Onchain Capital Allocator | $1,310,000,000 | $39,492,441 |
| 7 | USDD | CDP | $953,000,000 | $38,403,171 |
| 8 | RockawayX | Onchain Capital Allocator | $832,000,000 | $30,833,215 |
| 9 | OnRe | Insurance | $642,000,000 | $29,105,311 |
| 10 | Bittensor dTAO | Chain | $618,000,000 | $28,845,557 |

## Farm plans, netted to the dollar

Every row carries a 7-step plan built from one numeric ledger: a core position sized by TVL band, a second surface at 40% of core on another chain where one exists, per-action gas priced by the main chain's tier, a bridge fee only when a second chain exists, and a swap allowance of max($1, 0.3% of core). Step 7 of each plan prints the netted total. Example, the top row (Sentora Curator): $326 of gas and fees ($312 gas + $14 fees) over 13 weeks to keep $3,500 of capital working ($2,500 core + $1,000 second surface), 90-day horizon, about 50 minutes a week.

## The page checks itself

The dashboard ships the 87 calibration tokens alongside the board and refits beta and every alpha in the browser, operation for operation the same fit as the program. On the sealed snapshot it reports: 198/198 implied values identical to board.json. Each protocol's detail view shows the same decomposition: its TVL, its category alpha with the count behind it, the fitted value, the capture factor, and the plan's netted economics.

## Run it

```
node --experimental-strip-types main.ts
```

- Input: `--input <path>`, else `$MAKEFUN_INPUT_DIR/snapshot.json`, else `/input/snapshot.json`. An input directory may be passed instead of the file.
- Output: `--output <dir>`, else `$MAKEFUN_OUTPUT_DIR`, else `/output`.
- Writes `board.json`, `dashboard/` (index.html, app.css, app.js, zz-data.js), `screenshots/` (copied through from this repo) and `dossier.json` (built with the vendored `buildDossier`; the program rebuilds it and throws if the rebuild differs).
- Node 22, standard library only, no network. Deterministic: two runs on the same snapshot are byte-identical (verified).

## Files

- `main.ts` - entrypoint: input/output resolution, gate assertions, artifact writing.
- `lib/model.ts` - the screen, the calibration set, the fit, the time-split tests, farm plans, board assembly.
- `dashboard/` - the research-note page: spec sheet, method, out-of-sample table, sortable board, per-protocol dossiers, calibration view.
- `vendor/makefun-board.ts` - platform dossier builder, vendored unchanged.
- `screenshots/` - board, protocol detail and category-filter views at 1440x900.

MIT licensed, see LICENSE.
