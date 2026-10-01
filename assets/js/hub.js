/* The Quant Bullpen — the hub (#/ and #/<L>).
 *
 *   band: the level and season, the phase (postseason round), at a glance (World Series
 *         favourite, games today, live games, the biggest gap);
 *   the postseason bracket with series odds against the market (when the bracket is set);
 *   games: live, today, the next days and recent results, each with the model against the
 *          market against the DraftKings line, and the live win probability;
 *   the biggest model–market gaps (games, series, futures);
 *   leaders (index.json "leaders"), World Series odds, explore links and the sister sites.
 *
 * Reads index.json (today, recent, upcoming, postseason, leaders; levels[L] for Triple-A),
 * markets.json (data/<L>/<S>/markets.json, else data/markets.json) and glossary.json (labels). */
(function (BP) {
'use strict';

const esc = BP.esc;
const isNum = BP.isNum;

/* Labels and formats for the leader keys the build is likely to write; glossary.json wins when it loads. */
const LEADER_META = {
  war: ['Bullpen WAR', '1'], hr: ['Home runs', 'int'], rbi: ['Runs batted in', 'int'], sb: ['Stolen bases', 'int'], avg: ['Batting average', 'avg'],
  obp: ['On-base percentage', 'avg'], slg: ['Slugging', 'avg'], ops: ['OPS', 'avg'], woba: ['wOBA', 'avg'], xwoba_plus: ['xwOBA+', 'avg'],
  xwoba: ['Savant xwOBA', 'avg'], xwoba_savant: ['Savant xwOBA', 'avg'], wrc_plus: ['wRC+', 'int'], bat_speed: ['Bat speed (mph)', '1'],
  decision_value: ['Decision value (runs)', '1'], ev90: ['90th-pct exit velocity', '1'], barrel_pct: ['Barrel rate', 'pct'],
  so: ['Strikeouts', 'int'], k: ['Strikeouts', 'int'], era: ['ERA', '2'], fip: ['FIP', '2'], whip: ['WHIP', '2'], k_pct: ['Strikeout rate', 'pct'],
  k_bb_pct: ['K-BB%', 'pct'], stuff_plus: ['Stuff+', 'int'], location_plus: ['Location+', 'int'], pitching_plus: ['Pitching+', 'int'],
  ff_velo: ['Four-seam velocity', '1'], whiff_pct: ['Whiff rate', 'pct'], csw_pct: ['CSW rate', 'pct'], ip: ['Innings', 'ip'], sv: ['Saves', 'int'],
  framing_runs: ['Framing runs', '1'], fielding_runs: ['Fielding runs', '1']
};
let GLOSS = null;
function glossMeta(key0) {
  const key = String(key0).replace(/^[hpt]_/, '');
  if (GLOSS && (GLOSS[key0] || GLOSS[key])) return GLOSS[key0] || GLOSS[key];
  const m = LEADER_META[key];
  return m ? { label: m[0], fmt: m[1] } : { label: BP.titleCase(key), fmt: null };
}
function indexGlossary(g) {
  const out = {};
  if (!g) return out;
  const visit = x => {
    if (Array.isArray(x)) { x.forEach(visit); return; }
    if (!x || typeof x !== 'object') return;
    if (x.key && x.label) out[x.key] = x;
    ['groups', 'items', 'metrics', 'entries'].forEach(k => { if (x[k]) visit(x[k]); });
    if (!x.key && !x.groups && !x.items && !x.metrics) Object.keys(x).forEach(k => { if (x[k] && typeof x[k] === 'object') visit(x[k]); });
  };
  visit(g);
  return out;
}
function fmtLeader(key, v) {
  const m = glossMeta(key);
  if (m.fmt) return BP.fmtVal(v, m.fmt);
  if (!isNum(v)) return '—';
  return Number.isInteger(Number(v)) ? String(v) : Math.abs(v) < 1 ? BP.fmtAvg(v) : BP.num(v, 1);
}

function tile(v, label, sub) { return '<div class="hb-tile"><span class="hb-v">' + v + '</span><span class="hb-l">' + esc(label) + '</span>' + (sub ? '<span class="hb-s">' + sub + '</span>' : '') + '</div>'; }

function leadersBlock(el, leaders, L) {
  const keys = Object.keys(leaders || {}).filter(k => (leaders[k] || []).length);
  if (!keys.length) { el.innerHTML = BP.muted('Leaderboards arrive with the first build.'); return; }
  let active = keys[0];
  const draw = () => {
    const rows = leaders[active] || [];
    const vals = rows.map(r => Number(r[1])).filter(isNum);
    const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    const lower = !!(glossMeta(active) || {}).lower;
    el.querySelector('.ld-rows').innerHTML = rows.map((r, i) => {
      const t = max > min ? (lower ? (max - r[1]) / (max - min) : (r[1] - min) / (max - min)) : 1;
      const team = BP.player(r[0]).team;
      return '<div class="rk-row"><span class="rk-n">' + (i + 1) + '</span><span class="rk-name">' + BP.playerLink(r[0], { level: L }) +
        (team ? '<span class="pl-team">' + esc(BP.teamAbbr(team)) + '</span>' : '') + '</span>' +
        '<span class="rk-bar"><span style="width:' + (30 + 70 * t).toFixed(0) + '%"></span></span><span class="rk-v">' + fmtLeader(active, r[1]) + '</span></div>';
    }).join('');
  };
  el.innerHTML = '<div class="toggle-row">' + BP.toggles(keys.map(k => ({ key: k, label: glossMeta(k).label })), active, 'data-ld') + '</div><div class="ld-rows"></div>' +
    '<a class="more-link" href="' + BP.href('leaders', L) + '">Every leaderboard, with filters and minimum samples →</a>';
  BP.wireToggles(el, 'data-ld', k => { active = k; draw(); });
  draw();
}

/* Futures in markets.json -> [{key, label, kind, model:{id:p}, market:{id:p}, sources}] (model falls back to the postseason sim). */
function futuresOf(mk, post) {
  if (BP.marketFutures) return BP.marketFutures(mk, post, null);
  const fut = (mk && mk.futures) || {};
  const pt = (post && post.teams) || {};
  return Object.keys(fut).map(k => {
    const f = fut[k] || {};
    const market = BP.titleProbs(f.market || f);
    let model = f.model || {};
    if (!Object.keys(model).length && /^ws|world/.test(k)) Object.keys(pt).forEach(t => { model[t] = pt[t].p_ws; });
    if (!Object.keys(model).length && /pennant/.test(k)) { const lg = /^al/.test(k) ? 'AL' : 'NL'; Object.keys(pt).forEach(t => { if (pt[t].league === lg) model[t] = pt[t].p_pennant; }); }
    const src = (f.market && f.market.sources) || f.sources || [];
    return { key: k, label: f.label || BP.titleCase(k), kind: f.kind || (/mvp|cy|roy/.test(k) ? 'player' : 'team'), model: model, market: market, sources: src, binary: !!(f.market && f.market.binary) };
  });
}

function gaps(cards, post, mk, L) {
  const out = [];
  const seen = {};
  cards.forEach(c => {
    if (!c || seen[c.gpk] || BP.isFinal(c)) return;
    seen[c.gpk] = 1;
    const m = c.model || {}, k = c.market || {};
    if (!isNum(m.p_home) || !isNum(k.p_home)) return;
    const e = m.p_home - k.p_home;
    const side = e >= 0 ? c.home : c.away, other = side === c.home ? c.away : c.home;
    out.push({ abs: Math.abs(e), html: '<span class="what"><a href="' + BP.gameHref(c.gpk, L) + '">' + esc(BP.teamShort(side)) + ' to beat the ' + esc(BP.teamShort(other)) + '</a>' +
      '<small>' + esc(BP.fmtDate(c.date, { year: false })) + (c.series ? ' · ' + esc(BP.seriesText(c.series, true)) : '') + (k.sources ? ' · ' + esc(k.sources.join(', ')) : '') + '</small></span>',
      model: side === c.home ? m.p_home : 1 - m.p_home, market: side === c.home ? k.p_home : 1 - k.p_home });
  });
  ((post && post.series) || []).forEach(s => {
    if (!s.p || !s.market || BP.charts.winnerOf(Object.assign({}, s, { teams: (s.teams || []).map(String) }))) return;
    [0, 1].forEach(i => {
      if (!isNum(s.p[i]) || !isNum(s.market[i]) || s.p[i] < s.market[i]) return;
      out.push({ abs: Math.abs(s.p[i] - s.market[i]), html: '<span class="what"><a href="' + BP.ghref('postseason') + '">' + esc(BP.teamShort(s.teams[i])) + ' to win the ' + esc(BP.roundLabel(s.round, true)) + '</a><small>series · ' +
        esc(BP.teamAbbr(s.teams[0])) + ' ' + (s.wins ? s.wins[0] + '-' + s.wins[1] : '') + ' ' + esc(BP.teamAbbr(s.teams[1])) + '</small></span>', model: s.p[i], market: s.market[i] });
    });
  });
  futuresOf(mk, post).forEach(f => {
    if (f.binary) return;
    Object.keys(f.market).forEach(id => {
      const p = f.model[id], q = f.market[id];
      if (!isNum(p) || !isNum(q)) return;
      out.push({ abs: Math.abs(p - q), html: '<span class="what"><a href="#/markets">' + esc(f.kind === 'team' ? BP.teamShort(id) : BP.playerName(id)) + ' · ' + esc(f.label) + '</a><small>futures</small></span>', model: p, market: q });
    });
  });
  out.sort((a, b) => b.abs - a.abs);
  if (!out.length) return BP.muted('No market prices to compare yet.');
  return '<div class="gap-row head"><span>Outcome</span><span class="v">Model</span><span class="v">Market</span><span class="v">Gap</span></div>' +
    out.slice(0, 8).map(g => '<div class="gap-row">' + g.html + '<span class="v">' + BP.pct(g.model, 0) + '</span><span class="v">' + BP.pct(g.market, 0) + '</span><span class="v">' + BP.edgeHTML(g.model, g.market) + '</span></div>').join('') +
    '<div class="section-note">Gaps are model minus de-vigged market, in percentage points. They are not tips: markets know about late scratches, injuries and bullpen availability the model may not. 18+.</div>' +
    '<a class="more-link" href="#/markets">Every market against the model →</a>';
}

function wsOdds(post, mk) {
  const pt = (post && post.teams) || {};
  const fut = futuresOf(mk, post).find(f => /^ws|world/.test(f.key));
  const mkt = fut ? fut.market : {};
  const rows = Object.keys(pt).map(t => ({ t: t, p: pt[t].p_ws, m: mkt[t] })).filter(r => isNum(r.p) && r.p > 0).sort((a, b) => b.p - a.p).slice(0, 8);
  if (!rows.length) return BP.muted('The postseason simulation arrives with the bracket.');
  const max = Math.max.apply(null, rows.map(r => Math.max(r.p, r.m || 0)));
  return '<div class="race-row head"><span></span><span>Team</span><span class="v">Model</span><span class="v">Market</span></div>' +
    rows.map((r, i) => '<div class="race-row"><span class="rk-n">' + (i + 1) + '</span><span class="rk-name">' + BP.teamLink(r.t) + '</span>' +
      '<span class="v"><span class="mini-bar"><i style="width:' + (100 * r.p / max).toFixed(0) + '%;background:' + BP.teamColour(r.t) + '"></i></span>' + BP.pct(r.p, 0) + '</span>' +
      '<span class="v">' + (isNum(r.m) ? BP.pct(r.m, 0) + ' <span class="rk-sub">' + BP.edgeHTML(r.p, r.m, 0) + '</span>' : '—') + '</span></div>').join('') +
    '<a class="more-link" href="' + BP.ghref('postseason') + '">Series odds, path odds and the market →</a>';
}

function explore(L) {
  const links = [
    ['games', 'Games', 'Every game, model against market', false], ['standings', 'Standings', 'Pythag, expected W-L, odds', false],
    ['postseason', 'Postseason', 'Bracket, series and path odds', true], ['hitters', 'Hitters', 'Percentiles over the full catalogue', false],
    ['pitchers', 'Pitchers', 'Stuff, location, arsenals', false], ['leaders', 'Leaders', 'Any metric, any minimum', false],
    ['umpires', 'Umpires', 'Accuracy, scorecards, ABS', true], ['parks', 'Parks', 'Our park factors and weather', true],
    ['prospects', 'Prospects', 'Triple-A translations', true], ['history', 'History', 'All-time, era-adjusted, from 1901', true],
    ['lab', 'Lab', 'Scatter any two metrics', false], ['calibration', 'Calibration', 'Against the closing lines', true]
  ];
  return '<div class="hub-links pad">' + links.map(l => '<a href="' + (l[3] ? BP.ghref(l[0]) : BP.href(l[0], L)) + '"><b>' + esc(l[1]) + '</b><span>' + esc(l[2]) + '</span></a>').join('') +
    '<a href="#/methodology"><b>Methodology</b><span>How the models work</span></a><a href="#/glossary"><b>Glossary</b><span>Every metric, with stabilisation points</span></a>' +
    '<a href="' + BP.FOOTBALL_URL + '"><b>⚽ The Quant Footballer</b><span>The sister site for football</span></a>' +
    '<a href="' + BP.PADDOCK_URL + '"><b>🏁 The Quant Paddock</b><span>The sister site for Formula 1</span></a>' +
    '<a href="' + BP.HARDWOOD_URL + '"><b>🏀 The Quant Hardwood</b><span>The sister site for the NBA and WNBA</span></a>' +
    '<a href="' + BP.ACE_URL + '"><b>🎾 The Quant Ace</b><span>The sister site for ATP and WTA tennis</span></a></div>';
}

const PHASE = { preseason: 'Preseason', regular: 'Regular season', postseason: 'Postseason', offseason: 'Off-season', complete: 'Season complete' };

function render(el, params) {
  const L = params.level, S = params.season;
  const idx = BP.index() || {};
  const isCurrent = S === BP.currentSeason(L);
  const lv = BP.levelInfo(L);
  // MLB cards live at the top of index.json; Triple-A ones under levels.aaa
  const src = L === 'mlb' ? idx : lv;
  let post = L === 'mlb' ? (idx.postseason || null) : (lv.postseason || null);
  el.innerHTML = '<div class="bp-band" id="hub-band"></div><div id="hub-bracket"></div><div class="hub-cols"><div id="hub-left"></div><div id="hub-right"></div></div>' +
    BP.card('Explore', 'the ' + BP.levelName(L) + ' pages and the sister sites', explore(L));
  return BP.loadAll([BP.ypath('markets.json', L, S), 'markets.json', 'glossary.json', BP.ypath('season.json', L, S)]).then(arr => {
    if (!el.isConnected) return;
    const mk = L !== 'mlb' ? null : (BP.ok(arr[0]) ? arr[0] : (BP.ok(arr[1]) ? arr[1] : null));
    if (BP.ok(arr[2])) GLOSS = indexGlossary(arr[2]);
    // index.json carries the series; season.json adds the seeds and every team's path odds
    const sp = BP.ok(arr[3]) && arr[3].postseason && typeof arr[3].postseason === 'object' ? arr[3].postseason : null;
    if (sp && isCurrent) post = Object.assign({}, sp, post || {}, { teams: (post && post.teams) || sp.teams, seeds: (post && post.seeds) || sp.seeds, sims: (post && post.sims) || sp.sims });
    const all = [].concat(src.today || [], src.upcoming || [], src.recent || []);
    const live = isCurrent ? (src.today || []).filter(BP.isLive) : [];
    const today = isCurrent ? (src.today || []).filter(c => !BP.isLive(c)) : [];
    const upcoming = isCurrent ? (src.upcoming || []) : [], recent = isCurrent ? (src.recent || []) : [];
    const phase = String(lv.phase || idx.phase || '');
    const pt = (post && post.teams) || {};
    let fav = null;
    Object.keys(pt).forEach(t => { if (isNum(pt[t].p_ws) && (!fav || pt[t].p_ws > pt[fav].p_ws)) fav = t; });

    // ── band
    let left = '<div class="card"><div class="pad"><div class="hb-kicker">' + esc(BP.levelLong(L)) + (phase ? ' · ' + esc(PHASE[phase] || BP.titleCase(phase)) : '') +
      (post && post.round && phase === 'postseason' ? ' · ' + esc(BP.roundLabel(post.round)) : '') + '</div>' +
      '<div class="hb-tour">' + esc(BP.levelName(L)) + ' <span class="hb-year">' + S + '</span></div>';
    if (!isCurrent) left += '<div class="hb-sub">The ' + S + ' season. <a href="' + BP.href('games', L, S) + '">Every game →</a> · <a href="' + BP.href('standings', L, S) + '">Final standings →</a></div>';
    else if (phase === 'postseason') left += '<div class="hb-sub">The postseason is under way: series odds from simulating the bracket, each game priced by the plate-appearance model with the probable starters, against Kalshi, Polymarket and the DraftKings line.</div>';
    else if (L === 'aaa') left += '<div class="hb-sub">Triple-A Statcast: the International and Pacific Coast Leagues, with major-league translations on the <a href="#/prospects">prospects page</a>.</div>';
    else left += '<div class="hb-sub">Every game priced by a plate-appearance simulation against the market and the DraftKings line, with live win probability while games are on.</div>';
    left += '</div></div>';
    const nToday = (src.today || []).length;
    const right = '<div class="card"><div class="card-header">At a glance</div><div class="pad"><div class="hub-mini-tiles">' +
      (L === 'mlb' ? tile(fav ? BP.teamLink(fav, { short: true }) : '—', 'World Series favourite', fav ? BP.pct(pt[fav].p_ws, 0) + ' (model)' : '') : tile('<a href="#/prospects">Prospects</a>', 'Triple-A translations', 'major-league equivalents')) +
      tile(String(nToday), 'Games today', live.length ? '<span class="cd-live"><span class="live-dot"></span> ' + live.length + ' live</span>' : '') +
      (L !== 'mlb' && !(post && post.series) ? tile(esc(BP.int((src.recent || []).length)), 'Recent games', '') : tile(post && post.series ? String(post.series.filter(s => !BP.charts.winnerOf(Object.assign({}, s, { teams: (s.teams || []).map(String) }))).length) : '—', 'Series in play', post && post.round ? esc(BP.roundLabel(post.round, true)) : '')) + '</div>' +
      '<div class="lw-sub" style="margin-top:10px">' + (idx.updated_at ? 'Updated ' + esc(BP.fmtStamp(idx.updated_at)) : '') + '</div></div></div>';
    document.getElementById('hub-band').innerHTML = left + right;

    // ── bracket
    const bk = document.getElementById('hub-bracket');
    if (post && post.series && post.series.length && isCurrent) {
      bk.innerHTML = BP.card('Postseason bracket', 'series wins · model probability to win the series · market beneath', '<div id="hub-bk"></div><a class="more-link" href="' + BP.ghref('postseason') + '">Series odds, path odds and the market →</a>');
      BP.charts.mlbBracket(document.getElementById('hub-bk'), post, { level: L });
    }

    // ── left: games and gaps
    const shown = {};
    const block = (title, list, opts) => {
      const l = list.filter(c => c && !shown[c.gpk]);
      if (!l.length) return '';
      l.forEach(c => { shown[c.gpk] = 1; });
      return '<div class="day-head">' + esc(title) + '</div><div class="gc-grid">' + l.map(c => BP.gameCard(c, Object.assign({ level: L }, opts || {}))).join('') + '</div>';
    };
    let games = block('Live', live);
    const todaySorted = today.filter(c => !BP.isFinal(c)).sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .concat(today.filter(BP.isFinal).sort((a, b) => String(b.start).localeCompare(String(a.start))));
    games += block('Today', todaySorted.slice(0, 16));
    games += block('Coming up', upcoming.slice().sort((a, b) => String(a.start || a.date).localeCompare(String(b.start || b.date))).slice(0, 8), { date: true });
    games += block('Recent results', recent.slice().sort((a, b) => String(b.start || b.date).localeCompare(String(a.start || a.date))).slice(0, 8), { date: true });
    document.getElementById('hub-left').innerHTML = BP.card(live.length ? 'Live and today' : 'Games', 'model · market (gap in points) · DraftKings line · win % beside each team',
      (games || BP.muted(isCurrent ? 'No ' + BP.levelName(L) + ' games in the next few days.' : 'Browse the ' + S + ' games by date.')) +
      '<a class="more-link" href="' + BP.href('games', L, S) + '">Every game by date →</a>') +
      (isCurrent && L === 'mlb' ? BP.card('Biggest model–market gaps', 'games, series and futures', gaps(all, post, mk, L)) : '');

    // ── right: World Series odds, leaders
    document.getElementById('hub-right').innerHTML = (isCurrent && post ? BP.card('World Series odds', 'model against the market', wsOdds(post, mk)) : '') +
      BP.card('Leaders', BP.levelName(L) + ' ' + S, '<div id="hub-ld"></div>');
    leadersBlock(document.getElementById('hub-ld'), L === 'mlb' ? idx.leaders : lv.leaders, L);
    BP.sortable(el);
    if (live.length) BP.liveRefresh([BP.ypath('markets.json', L, S)], 60000);
    BP.setMeta(post && post.sims ? BP.int(post.sims) + ' bracket simulations' : '');
  });
}

BP.route('hub', render);
})(window.BP);
