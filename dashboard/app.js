// Token Radar dashboard: renders the signal-2 board from zz-data.js.
// Views: #/ board, #/f/<category> filtered board, #/p/<slug> detail.
(function () {
  'use strict';
  var DATA = window.RADAR_DATA || { rows: [], as_of: '', floor_usd: 0 };
  var rows = DATA.rows || [];
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { q: '', cat: '', watchOnly: false, sortKey: 'rank', sortDir: 1 };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function money(n) {
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="chains">n/a</span>';
    var cls = v >= 0 ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v + '%</span>';
  }
  function tags(r) {
    var out = '';
    if (r.watchlist) out += '<span class="tag watch">WATCHLIST</span>';
    else out += '<span class="tag">EARLY</span>';
    if (r.shell < 1) out += '<span class="tag shell">SHELL x' + r.shell + '</span>';
    return out;
  }

  function categories() {
    var seen = {}, list = [];
    rows.forEach(function (r) {
      var c = r.category || '(none)';
      if (!seen[c]) { seen[c] = true; list.push(c); }
    });
    return list.sort();
  }

  function visibleRows() {
    var out = rows.filter(function (r) {
      if (state.cat && (r.category || '(none)') !== state.cat) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      return true;
    });
    var k = state.sortKey, d = state.sortDir;
    out.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va === null || va === undefined) va = -Infinity;
      if (vb === null || vb === undefined) vb = -Infinity;
      if (typeof va === 'string') return d * va.localeCompare(vb);
      return d * (va - vb);
    });
    return out;
  }

  function sortHeader(key, label, num) {
    var arrow = state.sortKey === key ? (state.sortDir === 1 ? ' ^' : ' v') : '';
    return '<th class="' + (num ? 'num' : '') + '" data-sort="' + key + '">' + label + arrow + '</th>';
  }

  function boardView() {
    var vis = visibleRows();
    var cats = categories();
    var opts = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var html = '<div class="controls">' +
      '<label>Category</label><select id="ctl-cat">' + opts + '</select>' +
      '<label>Search</label><input type="search" id="ctl-q" placeholder="name or slug" value="' + esc(state.q) + '">' +
      '<label class="toggle"><input type="checkbox" id="ctl-watch"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="spacer"></span><span class="count">' + vis.length + ' of ' + rows.length + ' protocols</span></div>';
    html += '<table class="board"><thead><tr>' +
      sortHeader('rank', '#', true) + sortHeader('name', 'Protocol', false) +
      sortHeader('category', 'Category', false) + '<th>Chains</th>' +
      sortHeader('tvl_usd', 'TVL', true) + sortHeader('change_7d', '7d', true) +
      sortHeader('implied_value_usd', 'Implied value', true) + '<th>Signal</th>' +
      '</tr></thead><tbody>';
    vis.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span><br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '(none)') + '</td>' +
        '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td>' + tags(r) + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('app').innerHTML = html;
    bindControls();
  }

  function bindControls() {
    var cat = document.getElementById('ctl-cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; boardView(); });
    var q = document.getElementById('ctl-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; var v = visibleRows(); refreshBody(v); });
    var w = document.getElementById('ctl-watch');
    if (w) w.addEventListener('change', function () { state.watchOnly = w.checked; boardView(); });
    bindTable();
  }

  function refreshBody() { boardView(); }

  function bindTable() {
    var ths = document.querySelectorAll('th[data-sort]');
    Array.prototype.forEach.call(ths, function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = -state.sortDir;
        else { state.sortKey = k; state.sortDir = k === 'name' || k === 'category' ? 1 : -1; }
        boardView();
      });
    });
    var trs = document.querySelectorAll('tr[data-slug]');
    Array.prototype.forEach.call(trs, function (tr) {
      tr.addEventListener('click', function () {
        location.hash = '#/p/' + tr.getAttribute('data-slug');
      });
    });
  }

  function detailView(slug) {
    var r = bySlug[slug];
    if (!r) { location.hash = '#/'; return; }
    var years = r.listed_at ? ((Date.parse(DATA.as_of) - Date.parse(r.listed_at)) / 31557600000).toFixed(1) : 'n/a';
    var html = '<p><a class="back" href="#/">&larr; back to the board</a></p>' +
      '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' + tags(r) + '</div>' +
      '<p class="chains">' + esc(r.slug) + ' &middot; rank ' + r.rank + ' of ' + rows.length + ' &middot; ' +
      esc(r.category || '(no category)') + ' &middot; ' + esc(r.chains.join(', ')) + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div class="cell"><span>7d TVL change</span><b>' + (r.change_7d === null ? 'n/a' : r.change_7d + '%') + '</b></div>' +
      '<div class="cell"><span>Tracked since</span><b>' + (r.listed_at || 'n/a') + '</b></div>' +
      '<div class="cell"><span>Years with no token</span><b>' + years + '</b></div>' +
      '<div class="cell"><span>Watchlist (floor ' + money(DATA.floor_usd) + ')</span><b>' + (r.watchlist ? 'yes' : 'no — early pick') + '</b></div>' +
      '</div>' +
      '<div class="panel"><h3>How signal-2 values ' + esc(r.name) + '</h3>' +
      '<p class="formula">' + money(r.tvl_usd) + ' TVL <span class="op">x</span> ' + r.multiple +
      ' category multiple (' + esc(r.category || 'default') + ') <span class="op">x</span> ' + r.momentum.toFixed(3) +
      ' momentum <span class="op">x</span> ' + r.age.toFixed(3) + ' age <span class="op">x</span> ' + r.shell +
      ' shell <span class="op">=</span> <span class="res">' + money(r.implied_value_usd) + '</span></p>' +
      '<p class="chains">Momentum comes from the 7-day TVL change, age from how long the protocol has run with no token recorded, and the shell factor discounts wrappers and points shells. Every input is a snapshot figure; nothing is hardcoded by name.</p></div>' +
      '<div class="panel"><h3>Farm plan — 7 steps</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div>';
    document.getElementById('app').innerHTML = html;
    window.scrollTo(0, 0);
  }

  function route() {
    var h = location.hash || '#/';
    var m = h.match(/^#\/p\/(.+)$/);
    if (m) { detailView(decodeURIComponent(m[1])); return; }
    var f = h.match(/^#\/f\/(.+)$/);
    if (f) { state.cat = decodeURIComponent(f[1]); boardView(); return; }
    boardView();
  }

  function masthead() {
    var watch = rows.filter(function (r) { return r.watchlist; }).length;
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    document.getElementById('masthead-stats').innerHTML =
      '<div class="stat"><b>' + rows.length + '</b><span>protocols</span></div>' +
      '<div class="stat"><b>' + watch + '</b><span>watchlist</span></div>' +
      '<div class="stat"><b>' + money(total) + '</b><span>total implied</span></div>' +
      '<div class="stat"><b>' + esc(DATA.as_of) + '</b><span>snapshot</span></div>';
    document.getElementById('model-note').textContent =
      'signal-2: implied = TVL x category multiple x momentum (7d change, clamped) x age (years with no token) x shell discount (0.55 for wrappers and points shells). Click any row for its inputs and farm plan.';
  }

  masthead();
  window.addEventListener('hashchange', route);
  route();
})();
