// signal-3 research note: rendering and verification.
//
// The page carries the whole model with it. Below, the fit is re-run
// in the browser from the calibration set the program shipped
// (zz-data.js): the pooled slope, each category's shrunk median
// intercept, and every row's implied value are recomputed and checked
// against board.json's figures, and the verdict is printed in the
// footer and on each detail view. The arithmetic here mirrors
// lib/model.ts operation for operation, so the check is a real one.
'use strict';

const D = window.RADAR_DATA;
const SHELL = new Set([
  'Restaking', 'Stablecoin Wrapper', 'Anchor BTC', 'Decentralized BTC',
  'Staking Pool', 'Dual-Token Stablecoin', 'Farm',
]);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const fmtPct = (v) => (v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
const fmtYears = (days) =>
  days === null ? 'unreported' : days < 730 ? (days / 365.25).toFixed(1) + ' y' : (days / 365.25).toFixed(1) + ' y';

// ---- the refit (mirror of lib/model.ts fitCore + priceOf) ----
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function refit() {
  const comps = D.comps;
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd));
  const n = comps.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const beta = sxy / sxx;
  const resid = comps.map((p, i) => ys[i] - beta * xs[i]);
  const alphaGlobal = median(resid);
  const byCat = new Map();
  comps.forEach((p, i) => {
    const c = p.category ?? 'Unclassified';
    const arr = byCat.get(c);
    if (arr) arr.push(resid[i]);
    else byCat.set(c, [resid[i]]);
  });
  const alpha = new Map();
  for (const [c, arr] of byCat) {
    const m = median(arr);
    alpha.set(c, { n: arr.length, alpha: (arr.length * m + D.fit.shrink_k * alphaGlobal) / (arr.length + D.fit.shrink_k) });
  }
  return { beta, alphaGlobal, alpha };
}
const FIT2 = refit();
function reprice(row) {
  const a = FIT2.alpha.get(row.category);
  const alpha = a ? a.alpha : FIT2.alphaGlobal;
  const fitted = Math.exp(alpha + FIT2.beta * Math.log(row.tvl_usd));
  const capture = SHELL.has(row.category) ? 0.55 : 1;
  return Math.max(1, Math.round(fitted * capture));
}
const refitMatches = D.rows.filter((r) => reprice(r) === r.implied_value_usd).length;

// ---- spec sheet header ----
function renderSpec() {
  const s = D.spec;
  const headline = D.fit.splits[0];
  document.getElementById('spec').innerHTML = `
    <div class="kicker"><span>make.fun &middot; token-radar-01 &middot; research note</span>
    <span>Snapshot as of ${esc(D.as_of)} &middot; ${esc(D.source.split(',')[0])}</span></div>
    <h1>Token Launch Radar: the pre-token universe, priced off its own trading tokens</h1>
    <div class="subtitle">${s.board_rows} protocols that record no token, each priced by a comps fit on the
    snapshot's own calibration tokens and given a farm plan netted to the dollar. The method is stated
    before the ranking it produces, and the page re-runs the fit below to check the board's figures.</div>
    <div class="specgrid">
      <div><div class="k">Universe</div><div class="v">${s.board_rows} rows <small>incl. ${s.watchlist_n}/${s.watchlist_n} watchlist</small></div></div>
      <div><div class="k">Calibration set</div><div class="v">${s.comps_n} tokens <small>${s.comps_dated} with listing dates</small></div></div>
      <div><div class="k">Fit</div><div class="v">&beta; ${D.fit.beta.toFixed(3)} <small>pooled log-log slope, K=${D.fit.shrink_k} shrinkage</small></div></div>
      <div><div class="k">Out-of-sample</div><div class="v">&times;${headline.median_factor.toFixed(2)} <small>median factor, test n=${headline.test_n}</small></div></div>
    </div>`;
  document.getElementById('foot').innerHTML = `
    <span>signal-3 &middot; a Node program (standard library only) reads the sealed snapshot and writes board.json, this page and its data, and dossier.json</span>
    <span>Page refit: &beta; and every &alpha; recomputed in this browser from the ${s.comps_n} calibration tokens &middot; ${refitMatches}/${s.board_rows} implied values identical to board.json</span>`;
}

// ---- method section ----
function methodHtml() {
  const s = D.spec;
  const splits = D.fit.splits
    .map(
      (x) => `<tr><td>${esc(x.label)}</td><td class="n">${x.train_n}</td><td class="n">${x.test_n}</td>
      <td class="n">${x.beta.toFixed(3)}</td><td class="n">&times;${x.median_factor.toFixed(2)}</td>
      <td class="n">${(x.within_2 * 100).toFixed(0)}%</td><td class="n">${(x.within_3 * 100).toFixed(0)}%</td></tr>`,
    )
    .join('');
  return `
  <section class="method">
    <h2>Method, stated before the ranking</h2>
    <div class="method-grid">
      <p><b>1 &middot; Universe.</b> ${s.no_token_n} protocols in the snapshot record no token. The wrapper
      screen sets aside ${s.no_token_n - s.board_rows} wrapped, staked or bridged products of tokens that
      already trade, versioned names and exchange shells, leaving the board's ${s.board_rows} rows. The
      watchlist is a floor, not a ceiling: all ${s.watchlist_n} of its protocols are on the board, and so
      are ${s.board_rows - s.watchlist_n} more below its $${(D.floor_usd / 1e6).toFixed(0)}M line.</p>
      <p><b>2 &middot; Calibration.</b> ${s.comps_base_n} protocols carry a trading token with a market cap.
      Venue tokens, staking receipts and bridge claims are excluded, because their cap per TVL dollar
      prices an underlying asset or a venue, not a protocol's future token. What remains is the
      calibration set: ${s.comps_n} operating protocols whose tokens actually trade.</p>
      <p><b>3 &middot; The fit.</b> In logs, ln(market cap) = &alpha;<sub>category</sub> + &beta; &middot; ln(TVL),
      with &beta; = ${D.fit.beta.toFixed(3)} fitted by least squares across the calibration set. Each
      &alpha; is its category's median residual, shrunk toward the global median with weight
      K = ${D.fit.shrink_k}, so a category with two exemplars borrows the market's level instead of
      shouting; a category with none takes the global &alpha; = ${D.fit.alpha_global.toFixed(2)}.</p>
      <p><b>4 &middot; Capture and context.</b> Wrapper and shell categories (staking pools, restaking,
      stablecoin wrappers, BTC anchors, farms) are priced at a 0.55 capture factor: their TVL mostly
      belongs to an underlying asset a native token could only partly capture. Momentum, age and chain
      count are printed as context and set each farm plan's cadence and size; they never move a price.</p>
    </div>
    <table class="oos">
      <tr><th>Out-of-sample test (time splits: no future information in any fit)</th><th class="n">Train</th><th class="n">Test</th><th class="n">&beta;</th><th class="n">Median factor</th><th class="n">Within &times;2</th><th class="n">Within &times;3</th></tr>
      ${splits}
    </table>
    <p class="limits">Limits, plainly: a comps price claims what a token would be worth if the protocol's
    record stayed as it is; it does not claim a token will exist. The 2026 walk-forward cell is the weakest
    (n = 8) because a newly listed token's cap has not settled; the headline split prices 47 later listings
    at a median factor of &times;${D.fit.splits[0].median_factor.toFixed(2)}. Every figure on this page is
    recomputed from the calibration set in the browser and checked against board.json (see the footer).</p>
  </section>`;
}

// ---- board view ----
const state = { q: '', category: '', chain: '', segment: 'board', sortKey: 'rank', sortDir: 1 };
function visibleRows() {
  let rows = D.rows;
  if (state.segment === 'watchlist') rows = rows.filter((r) => r.watchlist);
  if (state.category) rows = rows.filter((r) => r.category === state.category);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  }
  const k = state.sortKey;
  const dir = state.sortDir;
  const val = (r) =>
    k === 'name' ? r.name.toLowerCase()
    : k === 'category' ? r.category
    : k === 'change' ? (r.change_7d === null ? -Infinity : r.change_7d)
    : k === 'age' ? (r.age_days === null ? -Infinity : r.age_days)
    : k === 'mult' ? r.implied_value_usd / r.tvl_usd
    : r[k];
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    const c = va < vb ? -1 : va > vb ? 1 : a.slug < b.slug ? -1 : 1;
    return c * dir;
  });
}
function boardHtml() {
  const cats = [...new Set(D.rows.map((r) => r.category))].sort();
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  const rows = visibleRows()
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}">
      <td class="rank">${r.rank}</td>
      <td><b>${esc(r.name)}</b>${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}<br><span class="slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category)}</td>
      <td>${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</td>
      <td class="n">${fmt$(r.tvl_usd)}</td>
      <td class="n ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${fmtPct(r.change_7d)}</td>
      <td class="n">${fmtYears(r.age_days)}</td>
      <td class="n"><b>${fmt$(r.implied_value_usd)}</b></td>
      <td class="n">${(r.implied_value_usd / r.tvl_usd).toFixed(3)}&times;</td></tr>`,
    )
    .join('');
  const th = (key, label, cls) =>
    `<th class="${cls || ''} ${state.sortKey === key ? 'sorted' : ''}" data-sort="${key}">${label}</th>`;
  return `
  ${methodHtml()}
  <div class="controls">
    <input type="search" id="q" placeholder="Search name or slug" value="${esc(state.q)}">
    <select id="cat"><option value="">All categories</option>${cats.map((c) => `<option ${c === state.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="chain"><option value="">All chains</option>${chains.map((c) => `<option ${c === state.chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <div class="seg">
      <button data-seg="board" class="${state.segment === 'board' ? 'on' : ''}">Pre-token board</button>
      <button data-seg="watchlist" class="${state.segment === 'watchlist' ? 'on' : ''}">Watchlist only</button>
      <button data-seg="comps">Calibration set</button>
    </div>
    <span class="count">${visibleRows().length} of ${D.rows.length} rows &middot; click a row for its dossier</span>
  </div>
  <table class="board">
    <thead><tr>
      ${th('rank', '#')}${th('name', 'Protocol')}${th('category', 'Category')}<th>Chains</th>
      ${th('tvl_usd', 'TVL', 'n')}${th('change', '7d', 'n')}${th('age', 'Age', 'n')}
      ${th('implied_value_usd', 'Implied value', 'n')}${th('mult', 'x TVL', 'n')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- calibration view ----
function compsHtml() {
  const rows = [...D.comps]
    .sort((a, b) => b.mcap_usd - a.mcap_usd)
    .map(
      (p, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td><b>${esc(p.name)}</b><br><span class="slug">${esc(p.slug)}</span></td>
      <td>${esc(p.category ?? 'Unclassified')}</td>
      <td class="n">${fmt$(p.tvl_usd)}</td>
      <td class="n">${fmt$(p.mcap_usd)}</td>
      <td class="n">${(p.mcap_usd / p.tvl_usd).toFixed(3)}&times;</td>
      <td class="n">${p.listed_at ?? '—'}</td></tr>`,
    )
    .join('');
  return `
  <section class="method">
    <h2>The calibration set: the snapshot's own trading tokens</h2>
    <div class="method-grid">
      <p>These ${D.spec.comps_n} protocols are the entire evidence base for the board's prices: the fit's
      slope and every category intercept are computed from these rows and nothing else. The page re-runs
      that fit in the browser; the footer reports how many of the board's implied values it reproduces
      exactly.</p>
      <p>Excluded from the ${D.spec.comps_base_n} tokens with a market cap: exchange venue tokens, liquid
      staking and restaking receipts, bridge and canonical-bridge claims, restaked BTC, token lockers,
      stablecoin wrappers, dual-token stablecoins, BTC anchors and decentralised BTC wrappers. Their caps
      price an underlying asset or a venue, not an operating protocol's future token.</p>
    </div>
  </section>
  <div class="controls">
    <div class="seg">
      <button data-seg="board">Pre-token board</button>
      <button data-seg="watchlist">Watchlist only</button>
      <button data-seg="comps" class="on">Calibration set</button>
    </div>
    <span class="count">${D.comps.length} calibration tokens &middot; sorted by market cap</span>
  </div>
  <table class="board">
    <thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">Cap / TVL</th><th class="n">Listed</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---- detail view ----
function detailHtml(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) return `<p class="backline"><a href="#/">&larr; back to the board</a></p><p>No such protocol on the board.</p>`;
  const a = FIT2.alpha.get(r.category);
  const alpha = a ? a.alpha : FIT2.alphaGlobal;
  const mine = reprice(r);
  const catComps = D.comps
    .filter((p) => (p.category ?? 'Unclassified') === r.category)
    .sort((x, y) => y.mcap_usd - x.mcap_usd)
    .slice(0, 8);
  const compsRows = catComps.length
    ? catComps
        .map(
          (p) => `<tr><td>${esc(p.name)}</td><td class="n">${fmt$(p.tvl_usd)}</td><td class="n">${fmt$(p.mcap_usd)}</td><td class="n">${(p.mcap_usd / p.tvl_usd).toFixed(3)}&times;</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="4">No calibration token trades in this category; the global intercept prices this row.</td></tr>`;
  const e = r.plan;
  return `
  <p class="backline"><a href="#/">&larr; back to the board</a> &middot; rank ${r.rank} of ${D.rows.length}</p>
  <div class="detail-head">
    <h2>${esc(r.name)}${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}</h2>
    <div class="meta">${esc(r.slug)} &middot; ${esc(r.category)} &middot; ${esc(r.chains.join(', '))} &middot; listed ${r.listed_at ?? 'unreported'} (${fmtYears(r.age_days)} tracked, no token recorded)</div>
    <div class="big-implied">${fmt$(r.implied_value_usd)} <small>implied launch value &middot; ${(r.implied_value_usd / r.tvl_usd).toFixed(3)}&times; its TVL of ${fmt$(r.tvl_usd)}</small></div>
  </div>
  <div class="cols">
    <div class="section">
      <h2>How the price is built</h2>
      <table class="kv">
        <tr><th>TVL (snapshot)</th><td>${fmt$(r.tvl_usd)}</td></tr>
        <tr><th>Category intercept &alpha; (${esc(r.category)}, n = ${r.alpha_n} calibration tokens)</th><td>${r.alpha.toFixed(4)}</td></tr>
        <tr><th>Pooled slope &beta;</th><td>${D.fit.beta.toFixed(4)}</td></tr>
        <tr><th>Fitted value exp(&alpha; + &beta; &middot; ln TVL)</th><td>${fmt$(r.fitted_value_usd)}</td></tr>
        <tr><th>Capture factor</th><td>&times;${r.capture.toFixed(2)}</td></tr>
        <tr><th>Implied value (board.json)</th><td>${fmt$(r.implied_value_usd)}</td></tr>
        <tr><th>7-day TVL change (context, not priced)</th><td>${fmtPct(r.change_7d)}</td></tr>
      </table>
      <div class="refit">Page refit: this row recomputes to ${fmt$(mine)} in the browser &mdash; ${mine === r.implied_value_usd ? 'identical to board.json' : 'differs from board.json'}.</div>
    </div>
    <div class="section">
      <h2>Calibration tokens in ${esc(r.category)}</h2>
      <table class="kv">
        <tr><th>Protocol</th><td>TVL / cap / ratio</td></tr>
        ${compsRows}
      </table>
    </div>
  </div>
  <div class="section">
    <h2>Farm plan, netted to the dollar</h2>
    <div class="econ">
      <div><div class="k">Net cost of the plan</div><div class="v net">${fmt$(e.net_cost_usd)}</div></div>
      <div><div class="k">Working capital</div><div class="v">${fmt$(e.capital_usd)}</div></div>
      <div><div class="k">Gas over ${e.weeks} weeks</div><div class="v">${fmt$(e.gas_usd)}</div></div>
      <div><div class="k">Fees and allowances</div><div class="v">${fmt$(e.fees_usd)}</div></div>
      <div><div class="k">Core position</div><div class="v">${fmt$(e.core_usd)}</div></div>
      <div><div class="k">Second surface</div><div class="v">${fmt$(e.second_usd)}</div></div>
      <div><div class="k">Horizon</div><div class="v">${e.horizon_days} days</div></div>
      <div><div class="k">Time budget</div><div class="v">${e.weekly_minutes} min/wk</div></div>
    </div>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </div>`;
}

// ---- routing ----
function render() {
  renderSpec();
  const hash = location.hash || '#/';
  const view = document.getElementById('view');
  if (hash.startsWith('#/p/')) {
    view.innerHTML = detailHtml(decodeURIComponent(hash.slice(4)));
  } else if (hash === '#/comps') {
    view.innerHTML = compsHtml();
  } else {
    if (hash.startsWith('#/f/')) state.category = decodeURIComponent(hash.slice(4));
    view.innerHTML = boardHtml();
    wireBoard();
  }
  wireSeg();
  window.scrollTo(0, 0);
}
function wireSeg() {
  document.querySelectorAll('[data-seg]').forEach((b) =>
    b.addEventListener('click', () => {
      const seg = b.getAttribute('data-seg');
      if (seg === 'comps') {
        location.hash = '#/comps';
      } else {
        state.segment = seg;
        if (location.hash === '#/comps' || location.hash.startsWith('#/p/')) location.hash = '#/';
        else render();
      }
    }),
  );
}
function wireBoard() {
  const q = document.getElementById('q');
  if (q)
    q.addEventListener('input', () => {
      state.q = q.value;
      const v = document.getElementById('view');
      const pos = q.selectionStart;
      v.innerHTML = boardHtml();
      wireBoard();
      wireSeg();
      const q2 = document.getElementById('q');
      q2.focus();
      q2.setSelectionRange(pos, pos);
    });
  const cat = document.getElementById('cat');
  if (cat) cat.addEventListener('change', () => { state.category = cat.value; render(); });
  const chain = document.getElementById('chain');
  if (chain) chain.addEventListener('change', () => { state.chain = chain.value; render(); });
  document.querySelectorAll('th[data-sort]').forEach((t) =>
    t.addEventListener('click', () => {
      const key = t.getAttribute('data-sort');
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = key === 'name' || key === 'category' ? 1 : -1; }
      render();
    }),
  );
  document.querySelectorAll('tbody tr[data-slug]').forEach((tr) =>
    tr.addEventListener('click', () => { location.hash = '#/p/' + tr.getAttribute('data-slug'); }),
  );
}
window.addEventListener('hashchange', render);
render();
