// Cobras — fast-bowling biomechanics app (UI).
import * as DB from './db.js';
import * as A from './analysis.js';
import * as P from './pose.js';
import { progressChart, scatterChart } from './charts.js';
import * as PR from './programme.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// ---------- settings ----------
const SETTINGS_KEY = 'pacelab.settings';
const settings = Object.assign({ unit: 'kmh', complexity: 1, keepVideo: true, autoDetect: true }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
const TARGETS_KEY = 'pacelab.targets';
function readTargetEdits() {
  let st = {}; try { st = JSON.parse(localStorage.getItem(TARGETS_KEY)) || {}; } catch (e) { /* ignore */ }
  // Edits saved before age bands existed were for senior bowlers.
  if (!A.BANDS.some(b => st[b.key]) && Object.keys(st).length) st = { senior: st };
  return st;
}
function loadTargets() {
  const st = readTargetEdits(), out = {};
  for (const b of A.BANDS) { const t = A.defaultTargets(b.key); for (const k in t) Object.assign(t[k], (st[b.key] || {})[k] || {}); out[b.key] = t; }
  return out;
}
let targetsByBand = loadTargets();
function ageAt(dob, dateISO) { if (!dob) return null; const d = new Date(dob + 'T12:00'), n = new Date((dateISO || new Date().toISOString().slice(0, 10)) + 'T12:00'); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate(), 12)) a--; return a; }
const bandOf = (p, dateISO) => A.bandForAge(ageAt(p?.dob, dateISO));
const targetsOf = (p, dateISO) => targetsByBand[bandOf(p, dateISO).key];
const LIGHT_SHAPE = { green: '●', amber: '▲', red: '■' };
const lightDot = l => (l ? `<span class="tl tl-${l.light}" title="${A.LIGHT_LABEL[l.light]}">${LIGHT_SHAPE[l.light]}</span>` : '');
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };
const KMH_PER_MPH = 1.609344;
const speedOut = kmh => (kmh == null ? null : settings.unit === 'mph' ? kmh / KMH_PER_MPH : kmh);
const speedIn = v => (v === '' || v == null || isNaN(v) ? null : settings.unit === 'mph' ? Number(v) * KMH_PER_MPH : Number(v));
const speedUnit = () => (settings.unit === 'mph' ? 'mph' : 'km/h');

function metricDisplay(key, v) {
  const d = A.METRIC_BY_KEY[key];
  if (v == null || !Number.isFinite(v)) return '–';
  if (d.bool) return v ? '✓ Yes' : '✗ No';
  if (key === 'speed' || key === 'proj_speed') return speedOut(v).toFixed(1);
  if (d.unit === 's') return (v * 1000).toFixed(0);
  const out = v.toFixed(d.dp);
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}
function metricUnit(key) {
  const d = A.METRIC_BY_KEY[key];
  if (key === 'speed' || key === 'proj_speed') return speedUnit();
  if (d.unit === 's') return 'ms';
  return d.unit;
}
function metricValueForChart(key, v) {
  if (key === 'speed' || key === 'proj_speed') return speedOut(v);
  if (A.METRIC_BY_KEY[key].unit === 's') return v * 1000;
  return v;
}

// Projected ball speed is scaled to the bowler's own speed-gun readings once there are three or more.
function projCal(list) {
  const r = list.filter(d => d.metrics?.speed > 0 && d.metrics?.proj_speed > 0).map(d => d.metrics.speed / d.metrics.proj_speed).sort((a, b) => a - b);
  if (r.length < 3) return { k: 1, n: r.length };
  const mid = r.length >> 1;
  return { k: r.length % 2 ? r[mid] : (r[mid - 1] + r[mid]) / 2, n: r.length };
}
const withCal = (d, k) => (k === 1 || d.metrics?.proj_speed == null ? d : { ...d, metrics: { ...d.metrics, proj_speed: d.metrics.proj_speed * k } });
function lightsFor(d, others, p) {
  const lights = {}, targets = targetsOf(p, d.date);
  for (const m of A.METRICS) { const l = A.lightFor(m.key, d.metrics?.[m.key], targets, others.map(o => o.metrics?.[m.key])); if (l) lights[m.key] = l; }
  return lights;
}
function faultCard(f, opts = {}) {
  return `<div class="fault ${opts.level ? 'fault-' + opts.level : ''}">
    <div class="row between"><b>${opts.level ? LIGHT_SHAPE[opts.level] + ' ' : ''}${esc(f.name)}</b>${f.id <= 4 ? '<span class="tag">injury risk</span>' : ''}</div>
    ${opts.because ? `<p class="small muted m0">Flagged by: ${opts.because.map(esc).join(', ')}</p>` : `<p class="small muted m0">${esc(f.see)}</p>`}
    <p class="cue-line">Cue: “${esc(f.cue)}”</p>
    <ul class="drills">${f.drills.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${opts.action || ''}</div>`;
}

// ---------- UI helpers ----------
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html, buttons = [{ label: 'OK', value: true, primary: true }]) {
  return new Promise(resolve => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}<div class="modal-actions">${buttons.map((b, i) => `<button data-i="${i}" class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
    m.classList.add('show');
    m.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => { m.classList.remove('show'); resolve(buttons[+btn.dataset.i].value); });
  });
}
const confirmBox = (title, text, okLabel = 'Delete') => modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>`, [{ label: 'Cancel', value: false }, { label: okLabel, value: true, danger: true }]);
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function setTitle(t, back) {
  $('#title').textContent = t;
  const b = $('#back');
  b.hidden = !back; b.onclick = () => { if (back) location.hash = back; };
}
function setNav(active) { document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === active)); }

let cleanup = null;
function onLeave(fn) { cleanup = fn; }

// ---------- router ----------
async function route() {
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const h = location.hash.slice(1) || 'players';
  const [name, id] = h.split('/');
  window.scrollTo(0, 0);
  try {
    if (name === 'players') await viewPlayers();
    else if (name === 'player') await viewPlayer(id);
    else if (name === 'edit-player') await viewEditPlayer(id);
    else if (name === 'new') await viewNewDelivery(id);
    else if (name === 'delivery') await viewDelivery(id);
    else if (name === 'settings') await viewSettings();
    else if (name === 'guide') viewGuide();
    else location.hash = 'players';
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#players">Back to players</a></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- players ----------
async function viewPlayers() {
  setTitle('Cobras'); setNav('players');
  const players = await DB.listPlayers();
  const all = await DB.all('deliveries');
  const stats = {};
  for (const d of all) {
    const s = (stats[d.playerId] ||= { n: 0, last: null, best: null });
    s.n++; if (!s.last || d.date > s.last) s.last = d.date;
    if (d.metrics?.speed != null && (s.best == null || d.metrics.speed > s.best)) s.best = d.metrics.speed;
  }
  view.innerHTML = `
    ${players.length ? '' : `<div class="card hero"><h2>Welcome to Cobras</h2><p>Film a delivery side-on, let the app track the body, then review angles and the timing of each phase — and watch it change over the season.</p><p><a href="#guide">How to film for best results →</a></p></div>`}
    <div class="list">${players.map(p => {
      const s = stats[p.id] || { n: 0 };
      return `<a class="item" href="#player/${p.id}">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="grow"><div class="name">${esc(p.name)}</div>
        <div class="muted small">${p.arm === 'L' ? 'Left-arm' : 'Right-arm'}${p.heightCm ? ' · ' + p.heightCm + ' cm' : ''} · ${s.n} deliver${s.n === 1 ? 'y' : 'ies'}${s.last ? ' · last ' + new Date(s.last + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</div></div>
        ${s.best != null ? `<div class="pill">${speedOut(s.best).toFixed(0)}<small> ${speedUnit()}</small></div>` : ''}
      </a>`;
    }).join('')}</div>
    <a class="fab" href="#edit-player/new" aria-label="Add player">＋ Add player</a>`;
}
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

async function viewEditPlayer(id) {
  const isNew = id === 'new';
  const p = isNew ? { id: DB.uid(), name: '', arm: 'R', heightCm: '', dob: '', notes: '', created: Date.now() } : await DB.get('players', id);
  if (!p) { location.hash = 'players'; return; }
  setTitle(isNew ? 'Add player' : 'Edit player', isNew ? 'players' : 'player/' + id); setNav('players');
  view.innerHTML = `
    <form class="card form" id="pf">
      <label>Name<input name="name" required value="${esc(p.name)}" autocomplete="off"></label>
      <label>Bowling arm</label>
      <div class="seg" id="arm"><button type="button" data-v="R">Right-arm</button><button type="button" data-v="L">Left-arm</button></div>
      <label>Height (cm)<input name="heightCm" type="number" inputmode="decimal" min="100" max="230" value="${esc(p.heightCm)}" placeholder="e.g. 178"><span class="hint">Needed for stride length in cm and approach speed.</span></label>
      <label>Date of birth<input name="dob" type="date" value="${esc(p.dob)}"><span class="hint">Sets the age group for traffic-light targets and the ball cap.</span></label>
      <label>Notes<textarea name="notes" rows="3" placeholder="Goals, injuries, cues…">${esc(p.notes)}</textarea></label>
      <div class="row gap"><a class="btn" href="#${isNew ? 'players' : 'player/' + id}">Cancel</a><button class="btn primary grow">Save</button></div>
      ${isNew ? '' : '<button type="button" class="btn danger full" id="delp">Delete player</button>'}
    </form>`;
  let arm = p.arm || 'R';
  const seg = $('#arm');
  const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === arm));
  seg.onclick = e => { if (e.target.dataset.v) { arm = e.target.dataset.v; paint(); } }; paint();
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    Object.assign(p, { name: f.get('name').trim(), arm, heightCm: f.get('heightCm') ? Number(f.get('heightCm')) : '', dob: f.get('dob'), notes: f.get('notes'), updated: Date.now() });
    if (!p.name) return;
    await DB.put('players', p);
    DB.requestPersistence();
    toast(isNew ? 'Player added' : 'Saved');
    location.hash = 'player/' + p.id;
  };
  if (!isNew) $('#delp').onclick = async () => {
    const n = (await DB.deliveriesFor(id)).length;
    if (await confirmBox('Delete ' + p.name + '?', `This removes the player and all ${n} recorded deliveries. This cannot be undone.`)) {
      await DB.deletePlayer(id); toast('Player deleted'); location.hash = 'players';
    }
  };
}

function age(dob) { if (!dob) return null; const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; }

let playerTab = 'deliveries', progressMetric = 'speed';
async function viewPlayer(id) {
  const p = await DB.get('players', id);
  if (!p) { location.hash = 'players'; return; }
  setTitle(p.name, 'players'); setNav('players');
  const rawDs = await DB.deliveriesFor(id);
  const cal = projCal(rawDs);
  const ds = rawDs.map(d => withCal(d, cal.k));
  const a = age(p.dob);
  view.innerHTML = `
    <div class="card">
      <div class="row"><div class="avatar lg">${esc(initials(p.name))}</div>
      <div class="grow"><h2 class="m0">${esc(p.name)}</h2><div class="muted small">${p.arm === 'L' ? 'Left-arm' : 'Right-arm'}${p.heightCm ? ' · ' + p.heightCm + ' cm' : ' · <a href="#edit-player/' + id + '">add height</a>'}${a != null ? ' · age ' + a : ''} · ${bandOf(p, today()).label} targets</div></div>
      <a class="btn sm" href="#edit-player/${id}">Edit</a></div>
      ${p.notes ? `<p class="small notes">${esc(p.notes)}</p>` : ''}
      <a class="btn primary full" href="#new/${id}">🎥 Analyse a new delivery</a>
    </div>
    <div class="tabs" id="tabs"><button data-t="deliveries">Deliveries (${ds.length})</button><button data-t="progress">Progress</button><button data-t="programme">Programme</button><button data-t="links">What drives pace?</button></div>
    <div id="tabbody"></div>`;
  const tabs = $('#tabs');
  const show = t => { playerTab = t; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); renderTab(); };
  tabs.onclick = e => { if (e.target.dataset.t) show(e.target.dataset.t); };
  const body = $('#tabbody');
  function renderProgramme() {
    const prog = (p.programme ||= { start: '', faults: [] });
    const save = async () => { await DB.put('players', p); renderProgramme(); };
    const a = age(p.dob), cap = PR.ballCap(a);
    const wk = prog.start ? PR.weekFor(prog.start, today()) : null;
    const W = wk >= 1 && wk <= 12 ? PR.WEEKS[wk - 1] : null;
    // suggestions from the latest session
    const lastDate = ds.length ? ds[ds.length - 1].date : null;
    const sess = ds.filter(d => d.date === lastDate);
    const tally = {};
    for (const d of sess) for (const x of PR.drillsFor(lightsFor(d, ds.filter(o => o.id !== d.id), p), d.metrics || {}, targetsOf(p, d.date))) { const t = (tally[x.fault.id] ||= { fault: x.fault, n: 0, red: 0 }); t.n++; if (x.level === 'red') t.red++; }
    const sugg = Object.values(tally).filter(t => t.n >= sess.length / 2 && !prog.faults.includes(t.fault.id)).sort((x, y) => x.fault.id - y.fault.id);
    const full = prog.faults.length >= 2;
    body.innerHTML = `
      <div class="card">
        <h4 class="m0">12-week winter programme</h4>
        ${!prog.start ? `<p class="small muted">Three four-week blocks: assess and re-pattern, build, then transfer to match intensity. Set the date of week 1 to see what this bowler should be doing each week.</p>` : ''}
        <div class="form"><label>Week 1 starts<input type="date" id="pstart" value="${esc(prog.start)}"></label></div>
        ${prog.start && wk < 1 ? `<p class="small">Starts ${fmtDate(prog.start)}.</p>` : ''}
        ${wk > 12 ? `<p class="small">Programme finished. Do the final film against week 1 and set an individual summer plan, or set a new start date.</p>` : ''}
        ${W ? `<div class="week-now"><div class="row between"><b>Week ${W.w} of 12</b><span class="tag">${W.block}</span></div>
          <p class="m0"><b>Skill:</b> ${esc(W.skill)}</p><p class="m0"><b>Strength:</b> ${esc(W.sc)}</p>
          <p class="m0"><b>Balls this session:</b> ${esc(W.balls)}${cap ? ` · cap for age ${a}: ${cap}, whichever is lower` : ''}</p>
          ${PR.FILM_WEEKS.includes(W.w) ? `<p class="m0 small">🎥 Filming week — analyse deliveries in the app and compare with week 1.</p>` : ''}</div>` : ''}
        ${prog.start ? `<details class="small"><summary>All 12 weeks</summary><div class="weeks">${PR.WEEKS.map(x => `<div class="wk ${x.w === wk ? 'on' : ''}"><b>${x.w}</b><span><i>${x.block}.</i> ${esc(x.skill)} <span class="muted">· ${esc(x.sc)} · ${esc(x.balls)} balls</span></span></div>`).join('')}</div></details>` : ''}
      </div>
      <h4 class="section">Priority faults (${prog.faults.length} of 2)</h4>
      <p class="small muted sidepad">Fix one or two at a time, injury-risk faults first. One cue per session.</p>
      ${prog.faults.map(id => faultCard(PR.FAULT_BY_ID[id], { action: `<button class="btn sm" data-rm="${id}">Done / remove</button>` })).join('') || '<div class="card small muted">None set yet. Add from the suggestions or the library below.</div>'}
      ${sugg.length ? `<h4 class="section">Suggested from the latest session (${fmtDate(lastDate)})</h4>${sugg.map(t => faultCard(t.fault, { level: t.red ? 'red' : 'amber', because: [`${t.n} of ${sess.length} deliveries`], action: full ? '' : `<button class="btn sm primary" data-add="${t.fault.id}">Set as priority</button>` })).join('')}` : ''}
      <div class="card form"><label>Add from the problem / fix library
        <select id="libsel"><option value="">Choose a fault…</option>${PR.FAULTS.filter(f => !prog.faults.includes(f.id)).map(f => `<option value="${f.id}">${f.id}. ${esc(f.name)}${PR.MEASURED.includes(f.id) ? '' : ' (coach’s eye)'}</option>`).join('')}</select></label>
        <span class="hint">The app measures faults 2, 3, 5 and 12 from side-on video. The others need you to judge from front-on or behind.</span>
        <div id="libshow"></div></div>
      <div class="note risk">⚠️ Stop a bowler who reports back pain on one side, especially when leaning back. Refer to a physio; do not bowl through it.</div>`;
    $('#pstart').onchange = e => { prog.start = e.target.value; save(); };
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { prog.faults = prog.faults.filter(x => x !== +b.dataset.rm); save(); });
    const add = id => { if (prog.faults.length >= 2) return toast('Two priorities at most — remove one first'); prog.faults.push(id); prog.faults.sort((x, y) => x - y); save(); };
    body.querySelectorAll('[data-add]').forEach(b => b.onclick = () => add(+b.dataset.add));
    $('#libsel').onchange = e => {
      const f = PR.FAULT_BY_ID[e.target.value];
      $('#libshow').innerHTML = f ? faultCard(f, { action: `<p class="small muted m0">Likely cause: ${esc(f.cause)}</p><button class="btn sm primary" id="libadd">Set as priority</button>` }) : '';
      if (f) $('#libadd').onclick = () => add(f.id);
    };
  }
  function renderTab() {
    if (playerTab === 'programme') return renderProgramme();
    if (!ds.length) { body.innerHTML = `<div class="card muted">No deliveries yet. Tap <b>Analyse a new delivery</b> to start.</div>`; return; }
    if (playerTab === 'deliveries') {
      const byDate = {}; [...ds].reverse().forEach(d => (byDate[d.date] ||= []).push(d));
      body.innerHTML = Object.entries(byDate).map(([date, list]) => `<h4 class="section">${fmtDate(date)}</h4><div class="list">${list.map(d => `
        <a class="item" href="#delivery/${d.id}">
          ${d.thumb ? `<img class="thumb" src="${d.thumb}" alt="">` : '<div class="thumb"></div>'}
          <div class="grow"><div class="name">${d.label ? esc(d.label) : 'Delivery'}${d.flags?.risk ? ' <span class="flag">⚠</span>' : ''}</div>
          <div class="muted small">FFC→release ${metricDisplay('t_ffc_br', d.metrics?.t_ffc_br)} ms · front knee ${metricDisplay('fk_knee_br', d.metrics?.fk_knee_br)}°</div></div>
          ${d.metrics?.speed != null ? `<div class="pill">${metricDisplay('speed', d.metrics.speed)}<small> ${speedUnit()}</small></div>` : ''}
        </a>`).join('')}</div>`).join('');
    } else if (playerTab === 'progress') {
      const avail = A.METRICS.filter(m => !m.bool && ds.some(d => d.metrics?.[m.key] != null));
      if (!avail.find(m => m.key === progressMetric)) progressMetric = avail[0]?.key;
      const groups = [...new Set(avail.map(m => m.group))];
      body.innerHTML = `<div class="card">
        <select id="metricSel" class="full">${groups.map(g => `<optgroup label="${g}">${avail.filter(m => m.group === g).map(m => `<option value="${m.key}" ${m.key === progressMetric ? 'selected' : ''}>${m.label} (${metricUnit(m.key)})</option>`).join('')}</optgroup>`).join('')}</select>
        <div id="pc"></div><p class="small pkey" id="pkey"></p><p class="small muted" id="pdesc"></p><div id="psum" class="stats"></div></div>`;
      const draw = () => {
        const def = A.METRIC_BY_KEY[progressMetric];
        const pts = ds.filter(d => d.metrics?.[progressMetric] != null).map(d => ({ id: d.id, date: d.date, value: metricValueForChart(progressMetric, d.metrics[progressMetric]), label: d.label, light: A.lightFor(progressMetric, d.metrics[progressMetric], targetsOf(p, d.date), ds.filter(o => o.id !== d.id).map(o => o.metrics?.[progressMetric]))?.light }));
        progressChart($('#pc'), pts, { unit: metricUnit(progressMetric), dp: def.unit === 's' ? 0 : def.dp, risk: def.risk ?? null, target: targetsOf(p, today())[progressMetric]?.type !== 'bool' ? targetsOf(p, today())[progressMetric] : null, onPick: p => (location.hash = 'delivery/' + p.id) });
        $('#pdesc').textContent = def.desc + (def.pace ? ` Pace link: ${def.pace === 'higher' ? 'higher' : 'lower'} tends to be better.` : '');
        const rated = pts.filter(x => x.light); const cnt = c => rated.filter(x => x.light === c).length;
        $('#pkey').innerHTML = rated.length ? `<span class="tl tl-green">●</span>In range ${cnt('green')} <span class="tl tl-amber">●</span>Close ${cnt('amber')} <span class="tl tl-red">●</span>Out of range ${cnt('red')}` : 'No target for this measure yet, so the dots are not rated.';
        const dates = [...new Set(pts.map(p => p.date))];
        const sAvg = dt => { const v = pts.filter(p => p.date === dt).map(p => p.value); return v.reduce((a, b) => a + b, 0) / v.length; };
        const first = sAvg(dates[0]), last = sAvg(dates[dates.length - 1]);
        const best = def.pace === 'lower' ? Math.min(...pts.map(p => p.value)) : Math.max(...pts.map(p => p.value));
        const dp = def.unit === 's' ? 0 : def.dp;
        $('#psum').innerHTML = `<div><span>${first.toFixed(dp)}</span>First session avg</div><div><span>${last.toFixed(dp)}</span>Latest session avg</div><div><span>${best.toFixed(dp)}</span>${def.pace ? 'Best' : 'Highest'}</div>`;
      };
      $('#metricSel').onchange = e => { progressMetric = e.target.value; draw(); };
      requestAnimationFrame(draw);
    } else {
      const withSpeed = ds.filter(d => d.metrics?.speed != null);
      if (withSpeed.length < 4) { body.innerHTML = `<div class="card"><p>Enter ball speeds (from a speed gun or radar app) on at least <b>4 deliveries</b> to see which parts of ${esc(p.name)}'s action go with extra pace.</p><p class="muted small">${withSpeed.length} so far.</p></div>`; return; }
      const rows = A.METRICS.filter(m => m.key !== 'speed' && m.key !== 'proj_speed' && !m.bool).map(m => {
        const pairs = withSpeed.filter(d => d.metrics[m.key] != null);
        const r = A.pearson(pairs.map(d => d.metrics[m.key]), pairs.map(d => d.metrics.speed));
        return { m, r, n: pairs.length };
      }).filter(x => x.r != null && x.n >= 4).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      body.innerHTML = `<div class="card"><p class="small muted">How strongly each measure moved with ball speed across ${withSpeed.length} deliveries (correlation r, −1 to +1). Bars to the right: more of this went with more pace. With few deliveries these are hints, not proof.</p>
        <div class="corr">${rows.map(x => `<button class="corr-row" data-k="${x.m.key}"><span class="cl">${x.m.label}</span><span class="cb"><i style="${x.r >= 0 ? 'left:50%' : 'right:50%'};width:${Math.abs(x.r) * 50}%"></i></span><span class="cv">${x.r >= 0 ? '+' : ''}${x.r.toFixed(2)}</span></button>`).join('')}</div>
        <div id="sc"></div></div>`;
      const sc = k => {
        const def = A.METRIC_BY_KEY[k];
        const pts = withSpeed.filter(d => d.metrics[k] != null).map(d => ({ x: metricValueForChart(k, d.metrics[k]), y: speedOut(d.metrics.speed), label: fmtDate(d.date) }));
        $('#sc').innerHTML = `<h4 class="section">${def.label} vs ball speed</h4><div id="scc"></div>`;
        scatterChart($('#scc'), pts, { xUnit: metricUnit(k), yUnit: speedUnit(), xdp: def.unit === 's' ? 0 : def.dp, xLabel: def.label });
        body.querySelectorAll('.corr-row').forEach(b => b.classList.toggle('on', b.dataset.k === k));
      };
      body.querySelector('.corr').onclick = e => { const b = e.target.closest('.corr-row'); if (b) sc(b.dataset.k); };
      if (rows[0]) requestAnimationFrame(() => sc(rows[0].m.key));
    }
  }
  show(playerTab);
}

// ---------- new delivery ----------
async function viewNewDelivery(pid) {
  const p = await DB.get('players', pid);
  if (!p) { location.hash = 'players'; return; }
  setTitle('New delivery', 'player/' + pid); setNav('players');
  view.innerHTML = `
    <div class="card"><h3 class="m0">${esc(p.name)} <span class="muted small">${p.arm === 'L' ? 'left-arm' : 'right-arm'}</span></h3>
    <p class="small muted">Film side-on from the bowler's ${p.arm === 'L' ? 'right' : 'left'} or right, phone still (tripod or fence), the whole delivery stride in frame. <a href="#guide">Filming guide</a></p></div>
    <div class="choices">
      <label class="choice"><input type="file" accept="video/*" id="pick" hidden><span class="ic">🎞️</span><b>Choose a video</b><span class="muted small">Best: phone's slow-motion mode (120–240 fps)</span></label>
      <button class="choice" id="rec"><span class="ic">⏺️</span><b>Record in app</b><span class="muted small">Quick, but usually limited to 30–60 fps</span></button>
      <label class="choice"><input type="file" accept="video/*" capture="environment" id="cam" hidden><span class="ic">📷</span><b>Open camera app</b><span class="muted small">Records with the phone camera, then returns here</span></label>
    </div>`;
  const onFile = e => { const f = e.target.files[0]; if (f) stepTrim(p, f, { source: 'file', name: f.name }); };
  $('#pick').onchange = onFile; $('#cam').onchange = onFile;
  $('#rec').onclick = () => stepRecord(p);
}

async function stepRecord(p) {
  view.innerHTML = `
    <div class="recwrap"><video id="live" playsinline muted autoplay></video>
      <div class="guide-box"></div><div class="rec-info" id="ri">Starting camera…</div>
      <div class="rec-ctrl"><button class="btn" id="cancel">Cancel</button><button class="recbtn" id="go" aria-label="Record"></button><span class="rec-time" id="rt"></span></div></div>
    <p class="small muted center">Line the crease up across the frame. Keep the phone still.</p>`;
  let stream, recorder, chunks = [], t0, timer;
  const stop = () => { clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
  onLeave(stop);
  $('#cancel').onclick = () => { stop(); location.hash = 'player/' + p.id; };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 120 } } });
  } catch (e) {
    $('#ri').textContent = 'Camera not available: ' + e.message + '. Use "Choose a video" instead.'; return;
  }
  const live = $('#live'); live.srcObject = stream;
  const st = stream.getVideoTracks()[0].getSettings();
  $('#ri').textContent = `${st.width}×${st.height} @ ${Math.round(st.frameRate || 30)} fps`;
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const go = $('#go');
  go.onclick = () => {
    if (!recorder) {
      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 16e6 });
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stop();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        stepTrim(p, blob, { source: 'camera', fps: Math.round(st.frameRate || 30) });
      };
      recorder.start(250); t0 = Date.now(); go.classList.add('on');
      timer = setInterval(() => { $('#rt').textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' s'; }, 100);
    } else { recorder.stop(); go.classList.remove('on'); }
  };
}

async function stepTrim(p, blob, meta) {
  onLeave(null);
  view.innerHTML = `
    <div class="card"><div class="vidwrap"><video id="v" playsinline muted></video></div>
      <input type="range" id="scrub" min="0" max="1000" value="0" class="full">
      <div class="row between small"><span id="tcur">0.00 s</span><span class="muted" id="tdur"></span></div>
      <div class="row gap"><button class="btn sm" id="st">⟦ Set start</button><button class="btn sm" id="play">▶︎ Play slow</button><button class="btn sm" id="en">Set end ⟧</button></div>
      <p class="small center" id="trimtxt"></p>
      <p class="small muted">Trim to roughly 0.5 s before the jump to 0.5 s after release. Shorter clips analyse faster.</p>
    </div>
    <div class="card form">
      <label>Video frame rate (fps)<input id="fps" type="number" inputmode="numeric" min="10" max="1000"><span class="hint" id="fpshint">Measuring…</span></label>
      <label>Recorded in slow motion?
        <select id="cap"><option value="">No — normal speed</option><option>120</option><option>240</option><option>480</option><option>960</option></select>
        <span class="hint">If the file plays back slowed down, pick the rate it was captured at so timings are in real seconds.</span></label>
      <label>Key moments (take-off, foot contacts, release)</label>
      <div class="seg" id="kmode"><button type="button" data-v="auto">Auto-detect</button><button type="button" data-v="manual">I'll mark them</button></div>
      <span class="hint">Either way you can check and move them frame by frame afterwards.</span>
      <label>Date<input id="date" type="date" value="${today()}"></label>
      <label>Ball speed (${speedUnit()}) <span class="muted">optional</span><input id="spd" type="number" inputmode="decimal" step="0.1" placeholder="from speed gun"></label>
      <label>Label <span class="muted">optional</span><input id="lbl" placeholder="e.g. Ball 3, yorker, new run-up"></label>
      <button class="btn primary full" id="an">Analyse</button>
    </div>`;
  const kmode = $('#kmode');
  const paintK = () => kmode.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'auto') === !!settings.autoDetect));
  kmode.onclick = e => { if (e.target.dataset.v) { settings.autoDetect = e.target.dataset.v === 'auto'; saveSettings(); paintK(); } }; paintK();
  const v = $('#v');
  let info;
  try { info = await P.loadVideo(v, blob); } catch (e) { view.innerHTML = `<div class="card"><h3>Can't open that video</h3><p>${esc(e.message)}</p><a class="btn" href="#new/${p.id}">Try another</a></div>`; return; }
  let start = 0, end = info.duration;
  const scrub = $('#scrub');
  const upd = () => { $('#tcur').textContent = v.currentTime.toFixed(2) + ' s'; $('#trimtxt').textContent = `Clip: ${start.toFixed(2)} s → ${end.toFixed(2)} s (${(end - start).toFixed(2)} s)`; };
  $('#tdur').textContent = 'of ' + info.duration.toFixed(2) + ' s';
  let seeking = false, want = null;
  scrub.oninput = async () => {
    v.pause(); want = scrub.value / 1000 * info.duration;
    if (seeking) return;
    seeking = true;
    while (want != null) { const t = want; want = null; await P.seek(v, t); upd(); }
    seeking = false;
  };
  v.ontimeupdate = () => { if (seeking) return; scrub.value = v.currentTime / info.duration * 1000; upd(); };
  $('#st').onclick = () => { start = v.currentTime; if (end <= start) end = info.duration; upd(); };
  $('#en').onclick = () => { end = v.currentTime; if (end <= start) start = 0; upd(); };
  $('#play').onclick = () => { if (v.paused) { v.playbackRate = 0.25; v.play(); } else v.pause(); };
  upd();
  const fpsIn = $('#fps');
  const detected = meta.fps || await P.detectFps(v, 0).catch(() => null);
  fpsIn.value = detected || 30;
  $('#fpshint').textContent = detected ? `Detected ${detected} fps — change it if you know better.` : 'Could not measure — enter it if you know it.';
  await P.seek(v, 0); upd();
  $('#an').onclick = async () => {
    const fileFps = Number(fpsIn.value) || 30;
    const cap = Number($('#cap').value) || 0;
    const timeScale = cap ? fileFps / cap : 1;
    const nFrames = Math.floor((end - start) * fileFps);
    if (nFrames < 6) return toast('Clip too short');
    if (nFrames > 1200 && !(await modal(`<h3>Long clip</h3><p>${nFrames} frames to analyse — this may take several minutes. Trim it closer to the delivery for faster results.</p>`, [{ label: 'Trim', value: false }, { label: 'Analyse anyway', value: true, primary: true }]))) return;
    stepAnalyse(p, v, blob, { start, end, fileFps, timeScale, captureFps: cap || fileFps, date: $('#date').value || today(), speed: speedIn($('#spd').value), label: $('#lbl').value.trim(), source: meta.source, manual: !settings.autoDetect });
  };
}

async function stepAnalyse(p, video, blob, opt) {
  let cancelled = false;
  video.pause(); video.ontimeupdate = null;
  view.innerHTML = `<div class="card center"><h3>Tracking body position…</h3>
    <canvas id="pv" class="preview"></canvas>
    <div class="progress"><i id="bar"></i></div><p class="small muted" id="ptxt">Loading pose model (first time can take a moment)…</p>
    <button class="btn" id="cx">Cancel</button></div>`;
  $('#cx').onclick = () => { cancelled = true; };
  onLeave(() => { cancelled = true; });
  const pv = $('#pv'), ctx = pv.getContext('2d');
  const t0 = performance.now();
  let res;
  try {
    res = await P.analyseVideo(video, {
      start: opt.start, end: opt.end, fileFps: opt.fileFps, timeScale: opt.timeScale, complexity: settings.complexity,
      isCancelled: () => cancelled,
      onProgress: (fr, f, canvas) => {
        $('#bar').style.width = (fr * 100).toFixed(1) + '%';
        const el = (performance.now() - t0) / 1000;
        $('#ptxt').textContent = `${Math.round(fr * 100)}% · ${Math.max(0, el / fr - el).toFixed(0)} s left`;
        if (pv.width !== canvas.width) { pv.width = canvas.width; pv.height = canvas.height; }
        ctx.drawImage(canvas, 0, 0);
        if (f.lm) drawSkeleton(ctx, f.lm, p.arm, canvas.width);
      },
    });
  } catch (e) {
    if (e.message === 'cancelled') { toast('Cancelled'); location.hash = 'player/' + p.id; return; }
    view.innerHTML = `<div class="card"><h3>Analysis failed</h3><p>${esc(e.message)}</p><a class="btn" href="#new/${p.id}">Try again</a></div>`; return;
  }
  $('#ptxt').textContent = 'Finding key moments…';
  const det = res.frames.filter(f => f.lm).length;
  if (det < res.frames.length * 0.3) {
    await modal(`<h3>Couldn't see the bowler clearly</h3><p>A body was found in only ${det} of ${res.frames.length} frames. Try better light, a closer camera, or a plainer background.</p>`);
    location.hash = 'new/' + p.id; return;
  }
  const s = A.prepareSeries(res.frames, { width: res.width });
  const auto = A.detectEvents(s, p.arm);
  const notes = auto.notes;
  const events = opt.manual ? { takeoff: null, bfc: null, ffc: null, br: null } : auto.events;
  const metrics = A.computeMetrics(s, events, p, { speed: opt.speed });
  const id = DB.uid();
  // snapshots at each event
  const imgs = {};
  for (const k of ['takeoff', 'bfc', 'ffc', 'br']) {
    const i = auto.events[k];
    if (i != null) { const b = await P.snapshot(video, res.frames[i].mt); if (b) imgs[k] = { blob: b, frame: i }; }
  }
  const tb = auto.events.br ?? Math.floor(res.frames.length / 2);
  const thumb = await makeThumb(video, res.frames[tb].mt, res.frames[tb]?.lm, p.arm, res.width);
  const d = {
    id, playerId: p.id, date: opt.date, label: opt.label, created: Date.now(),
    events, autoEvents: { ...auto.events }, manualMode: !!opt.manual, notes, metrics, flags: { risk: metrics.counter_rot > 30 },
    video: { start: opt.start, end: opt.end, fileFps: opt.fileFps, captureFps: opt.captureFps, timeScale: opt.timeScale, width: res.width, height: res.height, kept: !!settings.keepVideo },
    mts: res.frames.map(f => f.mt), thumb, comments: '',
  };
  await DB.put('frames', DB.packFrames(id, res.frames));
  await DB.put('snaps', { id, imgs: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, v.blob])), frames: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, v.frame])) });
  await DB.put('strips', { id, imgs: res.frames.map(f => f.img) });
  if (settings.keepVideo) await DB.put('videos', { id, blob });
  await DB.put('deliveries', d);
  DB.requestPersistence();
  location.hash = 'delivery/' + id;
}

async function makeThumb(video, mt, lm, arm, w) {
  await P.seek(video, mt);
  const c = document.createElement('canvas');
  const { w: cw } = P.drawFrame(video, c, 200);
  if (lm) { const sc = cw / w; const l2 = lm.map((v, i) => (i % 4 < 2 ? v * sc : v)); drawSkeleton(c.getContext('2d'), l2, arm, cw); }
  return c.toDataURL('image/jpeg', 0.7);
}

// ---------- drawing ----------
const COL = { arm: '#e34948', front: '#2a78d6', back: '#eda100', body: '#ffffff' };
function drawSkeleton(ctx, lm, arm, w, opts = {}) {
  const sd = A.sides(arm);
  const lw = Math.max(2, w / 300);
  const color = (a, b) => {
    const armSet = [sd.sh, sd.el, sd.wr], fl = [sd.frontHip, sd.frontKnee, sd.frontAnkle, sd.frontHeel, sd.frontToe], bl = [sd.backHip, sd.backKnee, sd.backAnkle, sd.backHeel, sd.backToe];
    if (armSet.includes(a) && armSet.includes(b)) return COL.arm;
    if (fl.includes(a) && fl.includes(b)) return COL.front;
    if (bl.includes(a) && bl.includes(b)) return COL.back;
    return COL.body;
  };
  ctx.lineCap = 'round';
  for (const [a, b] of A.SKELETON) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = lw + 2.5;
    ctx.beginPath(); ctx.moveTo(lm[a * 4], lm[a * 4 + 1]); ctx.lineTo(lm[b * 4], lm[b * 4 + 1]); ctx.stroke();
    ctx.strokeStyle = color(a, b); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(lm[a * 4], lm[a * 4 + 1]); ctx.lineTo(lm[b * 4], lm[b * 4 + 1]); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const k of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) { ctx.beginPath(); ctx.arc(lm[k * 4], lm[k * 4 + 1], lw * 1.2, 0, 7); ctx.fill(); }
  if (opts.angles) {
    const fs = Math.max(12, w / 45);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    for (const [k, val] of opts.angles) {
      if (!Number.isFinite(val)) continue;
      const x = lm[k * 4] + fs * 0.6, y = lm[k * 4 + 1] - fs * 0.4;
      const t = Math.round(val) + '°';
      const tw = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - 3, y - fs, tw + 6, fs * 1.25);
      ctx.fillStyle = '#fff'; ctx.fillText(t, x, y);
    }
  }
}

// ---------- delivery review ----------
async function viewDelivery(id) {
  const d = await DB.get('deliveries', id);
  if (!d) { location.hash = 'players'; return; }
  const p = await DB.get('players', d.playerId) || { name: '?', arm: 'R' };
  setTitle(p.name, 'player/' + d.playerId); setNav('players');
  const packed = await DB.get('frames', id);
  const frames = DB.unpackFrames(packed);
  const snaps = await DB.get('snaps', id);
  const vrec = d.video.kept ? await DB.get('videos', id) : null;
  const s = A.prepareSeries(frames, { width: d.video.width });
  const W = d.video.width, H = d.video.height;
  const allDs = await DB.deliveriesFor(d.playerId);
  let cal = projCal(allDs);
  let others = allDs.filter(x => x.id !== id).map(x => withCal(x, cal.k));
  if (d.metrics.proj_speed == null && A.EVENTS.some(e => d.events[e.key] != null)) { const m2 = A.computeMetrics(s, d.events, p, { speed: d.metrics.speed }); if (m2.proj_speed != null) { d.metrics = m2; await DB.put('deliveries', d); } }

  view.innerHTML = `
    <div class="card tight">
      <div class="row between"><div><b>${fmtDate(d.date)}</b>${d.label ? ' · ' + esc(d.label) : ''}</div><div class="muted small">${d.video.captureFps} fps</div></div>
      <div class="stage"><canvas id="cv" width="${W}" height="${H}"></canvas><div class="frame-tag" id="ftag"></div></div>
      <div class="timeline" id="tl"></div>
      <input type="range" id="sl" min="0" max="${s.n - 1}" value="${d.events.br ?? d.events.ffc ?? d.events.bfc ?? 0}" class="full">
      <div class="row between ctrls"><button class="btn sm" data-step="-10">⏪</button><button class="btn sm" data-step="-1">◀ 1</button><button class="btn sm" id="pl">▶︎</button><button class="btn sm" data-step="1">1 ▶</button><button class="btn sm" data-step="10">⏩</button><button class="btn sm" id="spdbtn">1×</button></div>
      <div class="evchips" id="evc"></div>
      <div class="readout" id="ro"></div>
      <div class="km" id="km">
        <div class="row between"><b>Key moments</b><span class="row gap"><button class="btn sm" id="reauto">Auto-detect</button><button class="btn sm" id="clr">Clear</button></span></div>
        <div id="kmguide"></div>
        <div class="evset">${A.EVENTS.map(e => `<button class="btn sm" data-set="${e.key}">Mark ${e.short} here</button>`).join('')}</div>
        <details class="small muted"><summary>What are TO, BFC, FFC and BR?</summary><dl class="defs">${A.EVENTS.map(e => `<dt>${e.short}</dt><dd><b>${e.label}.</b> ${e.desc}</dd>`).join('')}</dl></details>
      </div>
    </div>
    <div id="notes"></div>
    <div class="card form">
      <div class="row gap"><label class="grow">Ball speed (${speedUnit()})<input id="spd" type="number" inputmode="decimal" step="0.1" value="${d.metrics.speed != null ? speedOut(d.metrics.speed).toFixed(1) : ''}"></label>
      <label class="grow">Date<input id="dt" type="date" value="${d.date}"></label></div>
      <label>Label<input id="lbl" value="${esc(d.label || '')}"></label>
      <label>Coach notes<textarea id="cm" rows="2">${esc(d.comments || '')}</textarea></label>
    </div>
    <div id="score"></div>
    <div class="row between"><h4 class="section">Measurements</h4>
      <select id="cmp" class="sm"><option value="">Compare: player average</option>${others.map(o => `<option value="${o.id}">vs ${new Date(o.date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${o.label ? ' ' + esc(o.label) : ''}${o.metrics?.speed != null ? ' · ' + metricDisplay('speed', o.metrics.speed) : ''}</option>`).join('')}</select></div>
    <div id="mx"></div>
    <p class="small muted">All measurements come from a single phone camera and are estimates — most reliable for spotting changes in the same bowler filmed the same way. Rotation values (hips/shoulders) are least certain.</p>
    <button class="btn danger full" id="deld">Delete delivery</button>`;

  const cv = $('#cv'), ctx = cv.getContext('2d');
  // Frame strip: one small JPEG per analysed frame → instant scrubbing and smooth playback.
  let strip = (await DB.get('strips', id))?.imgs || null;
  // Older deliveries: build the strip once from the stored video, in the background.
  async function buildStrip() {
    const prep = document.createElement('div');
    prep.className = 'prep'; prep.innerHTML = '<div>Preparing smooth playback…</div><div class="progress"><i></i></div>';
    $('.stage').appendChild(prep);
    const video = document.createElement('video');
    try {
      await P.loadVideo(video, vrec.blob);
      const imgs = await P.makeStrip(video, d.mts, f => { prep.querySelector('i').style.width = (f * 100).toFixed(0) + '%'; }, () => !alive);
      await DB.put('strips', { id, imgs });
      if (alive) { strip = imgs; draw(); }
    } catch (e) { /* keep skeleton-only view */ }
    if (video._url) URL.revokeObjectURL(video._url);
    prep.remove();
  }
  const snapImgs = {};
  if (snaps) for (const k in snaps.imgs) { const im = new Image(); im.src = URL.createObjectURL(snaps.imgs[k]); snapImgs[k] = im; }
  let cur = +$('#sl').value, playing = false, drawToken = 0, alive = true;

  // Small decoded-frame cache with read-ahead.
  const cache = new Map(), loading = new Map(), CACHE_MAX = 120;
  function bitmap(i) {
    if (!strip || !strip[i]) return Promise.resolve(null);
    if (cache.has(i)) return Promise.resolve(cache.get(i));
    if (loading.has(i)) return loading.get(i);
    const pr = createImageBitmap(strip[i]).then(bm => {
      loading.delete(i);
      if (!alive) { bm.close(); return null; }
      cache.set(i, bm);
      if (cache.size > CACHE_MAX) { for (const k of cache.keys()) { if (Math.abs(k - cur) > 40) { cache.get(k).close(); cache.delete(k); if (cache.size <= CACHE_MAX) break; } } }
      return bm;
    }).catch(() => { loading.delete(i); return null; });
    loading.set(i, pr);
    return pr;
  }
  const prefetch = (from, dir = 1) => { for (let k = 1; k <= 12; k++) { const j = from + k * dir; if (j >= 0 && j < s.n) bitmap(j); } };
  const evColors = { takeoff: '#9085e9', bfc: COL.back, ffc: COL.front, br: COL.arm };
  function renderTimeline() {
    $('#tl').innerHTML = A.EVENTS.filter(e => d.events[e.key] != null).map(e => `<i style="left:${(d.events[e.key] / Math.max(1, s.n - 1) * 100).toFixed(2)}%;background:${evColors[e.key]}" title="${e.label}"></i>`).join('') + `<b style="left:${(cur / Math.max(1, s.n - 1) * 100).toFixed(2)}%"></b>`;
    const ffcT = d.events.ffc != null ? s.t[d.events.ffc] : null;
    $('#evc').innerHTML = A.EVENTS.map(e => {
      const i = d.events[e.key];
      return `<button class="evchip ${i === cur ? 'on' : ''}" data-go="${e.key}" ${i == null ? 'disabled' : ''}><i style="background:${evColors[e.key]}"></i>${e.short}<small>${i == null ? '—' : ffcT != null ? ((s.t[i] - ffcT) * 1000 >= 0 ? '+' : '') + Math.round((s.t[i] - ffcT) * 1000) + ' ms' : (s.t[i]).toFixed(3) + ' s'}</small></button>`;
    }).join('');
    const next = A.EVENTS.find(e => d.events[e.key] == null);
    const seq = A.EVENTS.map(e => d.events[e.key]).filter(x => x != null);
    const outOfOrder = seq.some((x, k) => k && x <= seq[k - 1]);
    const HOW = { takeoff: 'the last foot leaves the ground into the jump', bfc: 'the back foot first touches the ground', ffc: 'the front foot first touches the ground', br: 'the ball leaves the hand' };
    $('#kmguide').innerHTML = (next
      ? `<div class="km-next"><span><b>Next: ${next.label}.</b> Step to the frame where ${HOW[next.key]}.</span><button class="btn primary" data-set="${next.key}">Mark ${next.short} at this frame</button></div>`
      : `<p class="small muted m0">All four set. To move one, step to the right frame and tap its button.</p>`)
      + (outOfOrder ? '<p class="small warn-text">⚠ Markers are out of order — they should run TO → BFC → FFC → BR.</p>' : '');
    view.querySelectorAll('.evset [data-set]').forEach(b => b.classList.toggle('set', d.events[b.dataset.set] != null));
  }
  async function draw() {
    const token = ++drawToken;
    const i = cur;
    const bm = await bitmap(i);
    if (token !== drawToken || !alive) return;
    const f = frames[i];
    const snapKey = !bm && snaps && Object.keys(snaps.frames || {}).find(k => snaps.frames[k] === i && snapImgs[k]);
    if (bm) ctx.drawImage(bm, 0, 0, W, H);
    else if (snapKey && snapImgs[snapKey].complete) ctx.drawImage(snapImgs[snapKey], 0, 0, W, H);
    else { ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, W, H); }
    if (f.lm) {
      const ro = A.frameReadout(s, i, p.arm);
      const sd = A.sides(p.arm);
      drawSkeleton(ctx, f.lm, p.arm, W, { angles: [[sd.frontKnee, ro.frontKnee], [sd.backKnee, ro.backKnee], [sd.el, ro.elbow]] });
      if (!playing) $('#ro').innerHTML = `<div><span>${Math.round(ro.frontKnee)}°</span>Front knee</div><div><span>${Math.round(ro.backKnee)}°</span>Back knee</div><div><span>${Math.round(ro.elbow)}°</span>Elbow</div><div><span>${Math.round(ro.trunk)}°</span>Trunk lean</div>`;
    } else if (!playing) $('#ro').innerHTML = '<div class="muted small">No body detected in this frame</div>';
    const ffcT = d.events.ffc != null ? s.t[d.events.ffc] : null;
    $('#ftag').textContent = `frame ${i + 1}/${s.n}` + (ffcT != null ? ` · ${((s.t[i] - ffcT) * 1000).toFixed(0)} ms from FFC` : '');
    renderTimeline();
  }
  const go = (i, dir = 1) => { cur = Math.max(0, Math.min(s.n - 1, i)); $('#sl').value = cur; prefetch(cur, dir); draw(); };
  $('#sl').oninput = e => go(+e.target.value);
  view.querySelectorAll('[data-step]').forEach(b => b.onclick = () => go(cur + +b.dataset.step, Math.sign(+b.dataset.step)));
  $('#evc').onclick = e => { const b = e.target.closest('[data-go]'); if (b && d.events[b.dataset.go] != null) go(d.events[b.dataset.go]); };
  // Playback: frames shown at a steady rate; waits for a frame to decode rather than piling up.
  const SPEEDS = [{ l: '¼×', fps: 8 }, { l: '½×', fps: 15 }, { l: '1×', fps: 30 }];
  let spd = 2;
  $('#spdbtn').onclick = () => { spd = (spd + 1) % SPEEDS.length; $('#spdbtn').textContent = SPEEDS[spd].l; };
  $('#spdbtn').textContent = SPEEDS[spd].l;
  const stopPlay = () => { playing = false; $('#pl').textContent = '▶︎'; draw(); };
  $('#pl').onclick = async () => {
    if (playing) return stopPlay();
    playing = true; $('#pl').textContent = '❚❚';
    if (cur >= s.n - 1) cur = 0;
    let last = 0;
    while (playing && alive) {
      const now = await new Promise(r => requestAnimationFrame(r));
      if (now - last < 1000 / SPEEDS[spd].fps) continue;
      last = now;
      if (cur >= s.n - 1) { stopPlay(); break; }
      cur++; $('#sl').value = cur; prefetch(cur);
      await draw();
    }
  };
  onLeave(() => { playing = false; alive = false; for (const bm of cache.values()) bm.close(); cache.clear(); Object.values(snapImgs).forEach(im => URL.revokeObjectURL(im.src)); });
  $('#km').addEventListener('click', async e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    if (playing) stopPlay();
    d.events[b.dataset.set] = cur; await recompute(); toast(A.EVENTS.find(ev => ev.key === b.dataset.set).label + ' marked');
  });
  $('#reauto').onclick = async () => { const r = A.detectEvents(s, p.arm); d.autoEvents = { ...r.events }; d.notes = r.notes; d.events = { ...r.events }; await recompute(); toast('Auto-detected — check each marker'); };
  $('#clr').onclick = async () => { d.events = { takeoff: null, bfc: null, ffc: null, br: null }; await recompute(); toast('Markers cleared — mark them yourself'); };

  async function recompute() {
    const speed = d.metrics.speed;
    d.metrics = A.computeMetrics(s, d.events, p, { speed });
    d.flags = { risk: d.metrics.counter_rot > 30 };
    await DB.put('deliveries', d);
    renderMetrics(); draw();
  }
  function renderMetrics() {
    cal = projCal(allDs.map(x => (x.id === id ? d : x)));
    others = allDs.filter(x => x.id !== id).map(x => withCal(x, cal.k));
    const dv = withCal(d, cal.k), dm = dv.metrics;
    const cmpId = $('#cmp').value;
    let ref = {}, refLabel = 'avg';
    if (cmpId) { ref = others.find(o => o.id === cmpId)?.metrics || {}; refLabel = 'other'; }
    else {
      for (const m of A.METRICS) { const v = others.map(o => o.metrics?.[m.key]).filter(x => x != null); if (v.length) ref[m.key] = v.reduce((a, b) => a + b, 0) / v.length; }
    }
    const notes = A.coachingNotes(dm);
    const manual = JSON.stringify(d.events) !== JSON.stringify(d.autoEvents);
    const noneSet = A.EVENTS.every(e => d.events[e.key] == null);
    const autoNotes = noneSet ? [{ level: 'info', text: 'Mark the key moments under the video to get timings and angles.' }] : manual ? [{ level: 'info', text: 'Key moments set by hand.' }] : (d.notes || []).map(t => ({ level: 'info', text: t }));
    $('#notes').innerHTML = [...autoNotes, ...notes].map(n => `<div class="note ${n.level}">${n.level === 'risk' ? '⚠️' : n.level === 'tip' ? '💡' : 'ℹ️'} ${esc(n.text)}</div>`).join('');
    const targets = targetsOf(p, d.date), band = bandOf(p, d.date);
    const lights = lightsFor(dv, others, p);
    const fixes = PR.drillsFor(lights, dm, targets);
    const pri = p.programme?.faults || [];
    const cardKeys = ['speed', 'fk_knee_br', 'fk_change', 'trunk_flex', 'sep_max', 'counter_rot', 'stride_pct', 'approach', 'arm_vel', 'seq_ok'].filter(k => lights[k]);
    const count = c => Object.values(lights).filter(l => l.light === c).length;
    const kn = (label, val, unit, sub) => `<div class="kn"><span class="kv">${val}<small> ${val === '–' ? '' : unit}</small></span><span class="kl">${label}</span><span class="ks">${sub || ''}</span></div>`;
    const noH = !(Number(p.heightCm) > 0);
    const keyCard = `<div class="card tight"><h4 class="m0">Key numbers</h4><div class="kns">
      ${kn('Delivery stride', dm.stride_cm != null ? metricDisplay('stride_cm', dm.stride_cm) : metricDisplay('stride_pct', dm.stride_pct), dm.stride_cm != null ? 'cm' : '% height', dm.stride_cm != null ? metricDisplay('stride_pct', dm.stride_pct) + '% of height' : dm.stride_pct == null ? 'Mark BFC and FFC' : 'Add height for cm')}
      ${kn('Arm speed', metricDisplay('arm_vel', dm.arm_vel), '°/s', dm.arm_vel == null ? 'Mark release' : 'Peak, bowling arm')}
      ${kn('Run-up speed', metricDisplay('approach', dm.approach), 'm/s', dm.approach != null ? (dm.approach * 3.6).toFixed(0) + ' km/h · ' + (dm.approach * 2.23694).toFixed(0) + ' mph' : noH ? 'Add player height' : 'Mark take-off or BFC')}
      ${kn('Projected ball speed', metricDisplay('proj_speed', dm.proj_speed), speedUnit(), dm.proj_speed == null ? (noH ? 'Add player height' : 'Mark release') : cal.k !== 1 ? `Calibrated to ${cal.n} speed-gun readings` : 'Estimate from video')}
    </div>${dm.proj_speed != null && dm.speed != null ? `<p class="small muted m0">Speed gun for this ball: <b>${metricDisplay('speed', dm.speed)} ${speedUnit()}</b>.</p>` : dm.proj_speed != null && cal.k === 1 ? `<p class="small muted m0">Projected speed is a rough guide. Enter speed-gun readings on 3 or more deliveries and it calibrates to this bowler.</p>` : ''}</div>`;
    $('#score').innerHTML = keyCard + (cardKeys.length ? `<div class="card tight"><div class="row between"><h4 class="m0">Scorecard</h4><span class="small tl-count"><span class="tl tl-green">●</span> ${count('green')} <span class="tl tl-amber">▲</span> ${count('amber')} <span class="tl tl-red">■</span> ${count('red')}</span></div>
      <div class="tiles">${cardKeys.map(k => { const m = A.METRIC_BY_KEY[k], l = lights[k]; return `<div class="tile tile-${l.light}"><span class="tv">${metricDisplay(k, dm[k])}<small> ${m.bool ? '' : metricUnit(k)}</small></span><span class="tn">${m.label}</span><span class="ts">${LIGHT_SHAPE[l.light]} ${A.LIGHT_LABEL[l.light]}${l.basis === 'personal' ? ' · vs own avg' : ''}</span></div>`; }).join('')}</div>
      <p class="small muted m0">● Good ▲ Work on ■ Focus. Rated against <b>${band.label}</b> targets${p.dob ? ` (age ${ageAt(p.dob, d.date)} on the day)` : ' — add a date of birth to use junior targets'}. Change them in Settings.</p></div>` : '')
      + (fixes.length ? `<h4 class="section">Drills to fix this</h4>${fixes.map(x => faultCard(x.fault, { level: x.level, because: x.because.map(k => A.METRIC_BY_KEY[k].label), action: pri.includes(x.fault.id) ? '<span class="tag">★ current priority</span>' : `<button class="btn sm" data-pri="${x.fault.id}">Set as priority</button>` })).join('')}<p class="small muted sidepad">From your coaching programme's problem / fix library. Faults seen from front-on or behind (side-bend, head, front arm) are under the player's Programme tab.</p>` : '');
    const groups = [...new Set(A.METRICS.map(m => m.group))];
    $('#mx').innerHTML = groups.map(g => {
      const ms = A.METRICS.filter(m => m.group === g && !(m.key === 'stride_cm' && dm.stride_cm == null));
      return `<div class="card tight"><h4 class="m0">${g}</h4>${ms.map(m => {
        const v = dm[m.key], r = ref[m.key];
        let delta = '';
        if (v != null && r != null && !m.bool && others.length) {
          const dv = metricValueForChart(m.key, v) - metricValueForChart(m.key, r);
          const dp = m.unit === 's' ? 0 : m.dp;
          const good = m.pace ? ((m.pace === 'higher') === (dv > 0)) : null;
          if (Math.abs(dv) >= 10 ** -dp / 2) delta = `<span class="delta ${good == null ? '' : good ? 'up' : 'down'}">${dv > 0 ? '+' : ''}${dv.toFixed(dp)} vs ${refLabel}</span>`;
        }
        const risk = m.risk != null && v > m.risk;
        return `<details class="metric ${risk ? 'risk' : ''}"><summary><span class="ml">${lightDot(lights[m.key])}${m.label}</span><span class="mv">${metricDisplay(m.key, v)} <small>${v != null && !m.bool ? metricUnit(m.key) : ''}</small></span>${delta}</summary><p class="small muted">${esc(m.desc)}${m.pace ? ` <b>Pace link:</b> ${m.pace} is generally better.` : ''}${lights[m.key] ? ` <b>${A.LIGHT_LABEL[lights[m.key].light]}:</b> ${esc(lights[m.key].why)}` : ''}</p></details>`;
      }).join('')}</div>`;
    }).join('');
  }
  $('#cmp').onchange = renderMetrics;
  $('#score').addEventListener('click', async e => {
    const b = e.target.closest('[data-pri]'); if (!b || !p.id) return;
    const prog = (p.programme ||= { start: '', faults: [] });
    if (prog.faults.length >= 2) return toast('Two priorities at most — remove one in the Programme tab');
    prog.faults.push(+b.dataset.pri); prog.faults.sort((x, y) => x - y);
    await DB.put('players', p); toast('Added to ' + p.name + '’s priorities'); renderMetrics();
  });
  const saveField = async () => {
    d.metrics.speed = speedIn($('#spd').value); if (d.metrics.speed == null) delete d.metrics.speed;
    d.date = $('#dt').value || d.date; d.label = $('#lbl').value.trim(); d.comments = $('#cm').value;
    await DB.put('deliveries', d); renderMetrics();
  };
  ['#spd', '#dt', '#lbl', '#cm'].forEach(sel => $(sel).onchange = saveField);
  $('#deld').onclick = async () => { if (await confirmBox('Delete this delivery?', 'The video, tracking data and measurements will be removed.')) { await DB.deleteDelivery(id); toast('Deleted'); location.hash = 'player/' + d.playerId; } };
  renderMetrics();
  await draw();
  if (!strip && vrec) buildStrip();
}

// ---------- settings ----------
let settingsBand = 'senior';
async function viewSettings() {
  setTitle('Settings'); setNav('settings');
  const est = await DB.storageEstimate();
  const players = await DB.listPlayers(), ds = await DB.all('deliveries');
  view.innerHTML = `
    <div class="card form">
      <label>Speed units</label><div class="seg" id="unit"><button data-v="kmh">km/h</button><button data-v="mph">mph</button></div>
      <label>Tracking accuracy</label><div class="seg" id="cx"><button data-v="0">Fast</button><button data-v="1">Balanced</button><button data-v="2">Accurate</button></div>
      <span class="hint">Accurate is best for fast arm movement but is slower, especially on older phones.</span>
      <label class="check"><input type="checkbox" id="kv" ${settings.keepVideo ? 'checked' : ''}> Keep videos with each delivery <span class="hint">Turn off to save space — skeleton and key-frame photos are still kept.</span></label>
    </div>
    <div class="card"><h4 class="m0">Traffic-light targets</h4>
      <p class="small muted">● Good / ▲ Work on / ■ Focus. Each bowler is rated against the targets for their age on the day of the delivery, from their date of birth. No date of birth means Senior. Junior targets are eased for front-leg brace, approach speed and trunk drive; counter-rotation, stride length and sequence are the same at every age. Measures without a target are rated against the bowler's own average.</p>
      <div class="seg" id="tband">${A.BANDS.map(b => `<button data-v="${b.key}">${b.label}</button>`).join('')}</div>
      <div class="tgt">${Object.entries(targetsByBand[settingsBand]).filter(([, t]) => t.type !== 'bool').map(([k, t]) => { const m = A.METRIC_BY_KEY[k]; const f = (name, val) => `<input type="number" step="any" inputmode="decimal" data-k="${k}" data-f="${name}" value="${val}">`;
        return `<div class="tgt-row"><span>${m.label} <small class="muted">(${m.unit})</small></span>${t.type === 'range' ? `<label>Good from${f('lo', t.lo)}</label><label>to${f('hi', t.hi)}</label>` : `<label>${t.type === 'higher' ? 'Good ≥' : 'Good ≤'}${f('g', t.g)}</label><label>${t.type === 'higher' ? 'Focus <' : 'Focus >'}${f('a', t.a)}</label>`}</div>`; }).join('')}</div>
      <button class="btn sm" id="tgreset">Reset this age group</button>
    </div>
    <div class="card"><h4 class="m0">Your data</h4>
      <p class="small muted">${players.length} players · ${ds.length} deliveries${est ? ` · using ${(est.usage / 1048576).toFixed(0)} MB on this phone` : ''}. Everything is stored only on this phone.</p>
      <button class="btn full" id="csv">Export measurements (CSV for Excel)</button>
      <button class="btn full" id="bk">Back up everything (without videos)</button>
      <label class="btn full">Restore from backup<input type="file" accept=".json,application/json" id="rs" hidden></label>
      <button class="btn danger full" id="clrv">Delete all stored videos</button>
    </div>
    <div class="card" id="installCard" hidden><h4 class="m0">Install</h4><p class="small muted">Add Cobras to your home screen to use it like an app, offline.</p><button class="btn primary full" id="inst">Install Cobras</button></div>
    <div class="card small muted"><b>About.</b> Cobras tracks 33 body points per frame with Google's MediaPipe Pose, running entirely on the phone. Measurements are 2D/3D estimates from one camera — use them to track change and guide coaching, not as lab-grade or legality testing.</div>`;
  const seg = (sel, key, conv) => { const el = $(sel); const paint = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[key]) === b.dataset.v)); el.onclick = e => { if (e.target.dataset.v) { settings[key] = conv(e.target.dataset.v); saveSettings(); paint(); } }; paint(); };
  seg('#unit', 'unit', v => v); seg('#cx', 'complexity', Number);
  $('#kv').onchange = e => { settings.keepVideo = e.target.checked; saveSettings(); };
  view.querySelectorAll('.tgt input').forEach(inp => inp.onchange = () => {
    const v = Number(inp.value); if (!Number.isFinite(v)) return;
    const st = readTargetEdits();
    ((st[settingsBand] ||= {})[inp.dataset.k] ||= {})[inp.dataset.f] = v;
    try { localStorage.setItem(TARGETS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    targetsByBand = loadTargets(); toast('Target saved');
  });
  $('#tgreset').onclick = () => { const st = readTargetEdits(); delete st[settingsBand]; try { localStorage.setItem(TARGETS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } targetsByBand = loadTargets(); viewSettings(); toast('Targets reset for this age group'); };
  const tb = $('#tband'); tb.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === settingsBand));
  tb.onclick = e => { if (e.target.dataset.v) { settingsBand = e.target.dataset.v; const y = window.scrollY; viewSettings().then(() => window.scrollTo(0, y)); } };
  $('#csv').onclick = async () => {
    const pm = Object.fromEntries(players.map(p => [p.id, p]));
    const keys = A.METRICS.map(m => m.key);
    const head = ['player', 'arm', 'date', 'label', ...A.METRICS.map(m => `${m.label} (${metricUnit(m.key)})`), 'coach notes'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = ds.sort((a, b) => a.date.localeCompare(b.date)).map(d => [pm[d.playerId]?.name, pm[d.playerId]?.arm, d.date, d.label, ...keys.map(k => d.metrics?.[k] != null ? metricDisplay(k, d.metrics[k]).replace(/[✓✗] /, '') : ''), d.comments].map(q).join(','));
    download(new Blob(['﻿' + [head.map(q).join(','), ...rows].join('\r\n')], { type: 'text/csv' }), `cobras-${today()}.csv`);
  };
  $('#bk').onclick = async () => { toast('Preparing backup…'); download(await DB.exportBackup(), `cobras-backup-${today()}.json`); };
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const r = await DB.importBackup(f); toast(`Restored ${r.players} players, ${r.deliveries} deliveries`); viewSettings(); } catch (err) { modal(`<h3>Restore failed</h3><p>${esc(err.message)}</p>`); } };
  $('#clrv').onclick = async () => { if (await confirmBox('Delete all videos?', 'Measurements, skeletons and key-frame photos are kept.')) { for (const v of await DB.all('videos')) await DB.del('videos', v.id); for (const d of ds) if (d.video?.kept) { d.video.kept = false; await DB.put('deliveries', d); } toast('Videos deleted'); viewSettings(); } };
  if (deferredInstall) { $('#installCard').hidden = false; $('#inst').onclick = async () => { deferredInstall.prompt(); deferredInstall = null; $('#installCard').hidden = true; }; }
}

function viewGuide() {
  setTitle('Filming guide'); setNav('guide');
  view.innerHTML = `
    <div class="card guide">
      <h3>Set up the camera</h3>
      <ol>
        <li><b>Side-on, square to the crease.</b> Stand the phone level, at hip height, at right-angles to the run-up, about 10–15 m from the bowling crease.</li>
        <li><b>Keep it still.</b> Tripod, fence post or a bag — don't pan. Timing and speed depend on a fixed camera.</li>
        <li><b>Frame the action.</b> From the last couple of running strides through to follow-through, with the bowler's whole body (head to feet) in view. Landscape is best.</li>
        <li><b>Use slow motion.</b> Use the phone camera's slo-mo mode (120 or 240 fps) and pick the video with <i>Choose a video</i>. At normal 30 fps, front-foot-to-release is only 3–4 frames.</li>
        <li><b>Good light, plain background.</b> Bright daylight or nets with lights; avoid people walking behind. Fitted clothing helps the tracking.</li>
        <li><b>Same set-up every time.</b> Mark where the phone stands so progress compares like with like.</li>
      </ol>
      <h3>Key moments</h3>
      <p><b>TO</b> take-off into the bound · <b>BFC</b> back foot lands · <b>FFC</b> front foot lands · <b>BR</b> ball release. Choose <i>Auto-detect</i> or <i>I'll mark them</i> before analysing. Either way, step frame-by-frame on the review screen and use the <i>Mark … here</i> buttons to set each one exactly.</p>
      <h3>Reading the results</h3>
      <ul>
        <li><b>Front knee at release</b> — a straighter, braced front leg is one of the most consistent links with pace.</li>
        <li><b>Kinematic sequence</b> — pelvis, then trunk, then arm should peak in that order.</li>
        <li><b>Shoulder counter-rotation over ~30°</b> is linked with lower-back injury in young quicks — get a front-on video and a professional opinion.</li>
        <li><b>Drills and programme</b> — amber and red ratings link to the problem / fix library from your coaching programme. Each player's <i>Programme</i> tab shows the current week of the 12-week schedule and their one or two priority faults.</li>
        <li><b>What drives pace?</b> — enter speed-gun readings and the app shows which measures move with ball speed for each bowler.</li>
      </ul>
    </div>`;
}

// ---------- boot ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
route();
