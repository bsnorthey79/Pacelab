// Cobras — small dependency-free SVG charts with tap/hover tooltips.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}
const fmt = (v, dp) => (v == null || !Number.isFinite(v) ? '–' : Number(v).toFixed(dp));
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function tooltip(container) {
  let tip = container.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; container.appendChild(tip); }
  return {
    show(x, y, html) { tip.innerHTML = html; tip.style.display = 'block'; const cw = container.clientWidth; const tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(cw - tw, x - tw / 2)) + 'px'; tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px'; },
    hide() { tip.style.display = 'none'; },
  };
}

// points: [{ date:'YYYY-MM-DD', value, id }], chronological.
export function progressChart(container, points, { unit = '', dp = 1, risk = null, target = null, onPick } = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  if (!points.length) { container.innerHTML = '<p class="muted">No data for this measure yet.</p>'; return; }
  const W = Math.max(300, container.clientWidth || 340), H = 220;
  const m = { l: 44, r: 12, t: 14, b: 34 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, container);
  const vals = points.map(p => p.value);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (risk != null) { mn = Math.min(mn, risk); mx = Math.max(mx, risk); }
  if (target) { const th = target.type === 'range' ? [target.lo, target.hi] : [target.g, target.a]; mn = Math.min(mn, ...th); mx = Math.max(mx, ...th); }
  const pad = (mx - mn) * 0.1 || Math.abs(mx) * 0.1 || 1;
  const { lo, hi, ticks } = niceTicks(mn - pad, mx + pad);
  const n = points.length;
  const X = i => m.l + (n === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (n - 1));
  const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  if (target) {
    // traffic-light bands behind the data
    const band = (a, b, cls) => { const y1 = Y(Math.min(hi, Math.max(lo, b))), y2 = Y(Math.min(hi, Math.max(lo, a))); if (y2 - y1 > 0.5) el('rect', { x: m.l, y: y1, width: W - m.l - m.r, height: y2 - y1, class: 'band ' + cls }, svg); };
    const INF = 1e9;
    if (target.type === 'higher') { band(target.g, INF, 'g'); band(target.a, target.g, 'a'); band(-INF, target.a, 'r'); }
    else if (target.type === 'lower') { band(-INF, target.g, 'g'); band(target.g, target.a, 'a'); band(target.a, INF, 'r'); }
    else if (target.type === 'range') { band(target.lo, target.hi, 'g'); band(target.lo - target.m, target.lo, 'a'); band(target.hi, target.hi + target.m, 'a'); band(-INF, target.lo - target.m, 'r'); band(target.hi + target.m, INF, 'r'); }
  }
  for (const tv of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(tv), y2: Y(tv), class: 'grid' }, svg);
    el('text', { x: m.l - 6, y: Y(tv) + 4, 'text-anchor': 'end', class: 'axis' }, svg).textContent = +tv.toFixed(3);
  }
  if (risk != null && !target) {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(risk), y2: Y(risk), class: 'risk-line' }, svg);
    el('text', { x: W - m.r, y: Y(risk) - 4, 'text-anchor': 'end', class: 'risk-text' }, svg).textContent = `⚠ ${risk}${unit}`;
  }
  // date labels at the first delivery of each session (thinned)
  const firsts = []; points.forEach((p, i) => { if (i === 0 || p.date !== points[i - 1].date) firsts.push(i); });
  const every = Math.ceil(firsts.length / Math.max(1, Math.floor((W - m.l) / 60)));
  firsts.forEach((i, k) => { if (k % every === 0) el('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = fmtDate(points[i].date); });
  // session averages
  const groups = {}; points.forEach((p, i) => { (groups[p.date] ||= []).push(i); });
  const avg = Object.values(groups).map(ix => ({ x: ix.reduce((a, b) => a + X(b), 0) / ix.length, v: ix.reduce((a, b) => a + points[b].value, 0) / ix.length }));
  if (avg.length > 1) el('path', { d: avg.map((a, i) => `${i ? 'L' : 'M'}${a.x.toFixed(1)},${Y(a.v).toFixed(1)}`).join(''), class: 'avg-line' }, svg);
  else if (n > 1) el('line', { x1: m.l, x2: W - m.r, y1: Y(avg[0].v), y2: Y(avg[0].v), class: 'avg-line' }, svg);
  points.forEach((p, i) => el('circle', { cx: X(i), cy: Y(p.value), r: 5, class: 'dot' + (p.light ? ' dot-' + p.light : '') }, svg));
  // hit layer
  const tip = tooltip(container);
  const hl = el('circle', { r: 7, class: 'dot-hl', style: 'display:none' }, svg);
  const hit = el('rect', { x: m.l - 10, y: 0, width: W - m.l - m.r + 20, height: H, fill: 'transparent' }, svg);
  let cur = -1;
  const pick = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    let best = 0; for (let i = 1; i < n; i++) if (Math.abs(X(i) - px) < Math.abs(X(best) - px)) best = i;
    cur = best;
    const p = points[best];
    hl.setAttribute('cx', X(best)); hl.setAttribute('cy', Y(p.value)); hl.style.display = '';
    const sess = groups[p.date].map(i => points[i].value);
    const sAvg = sess.reduce((a, b) => a + b, 0) / sess.length;
    tip.show(X(best) * r.width / W, Y(p.value) * r.height / H,
      `<b>${fmt(p.value, dp)} ${unit}</b>${p.light ? ' · ' + ({ green: 'In range', amber: 'Close', red: 'Out of range' })[p.light] : ''}<br>${fmtDate(p.date)}${p.label ? ' · ' + p.label : ''}<br><span class="muted">Session avg ${fmt(sAvg, dp)} (${sess.length})</span>${onPick ? '<br><span class="link">Tap again to open</span>' : ''}`);
  };
  hit.addEventListener('pointermove', pick);
  hit.addEventListener('pointerdown', ev => { const before = cur; pick(ev); if (onPick && ev.pointerType !== 'mouse' && before === cur) onPick(points[cur]); });
  hit.addEventListener('click', ev => { if (onPick && ev.pointerType === 'mouse') onPick(points[cur]); });
  hit.addEventListener('pointerleave', () => { hl.style.display = 'none'; tip.hide(); cur = -1; });
}

// pts: [{x, y, label}] — metric (x) vs ball speed (y)
export function scatterChart(container, pts, { xUnit = '', yUnit = '', xdp = 1, ydp = 1, xLabel = '', yLabel = '' } = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  if (pts.length < 2) { container.innerHTML = '<p class="muted">Need at least 2 deliveries with a ball speed.</p>'; return; }
  const W = Math.max(300, container.clientWidth || 340), H = 240;
  const m = { l: 44, r: 12, t: 12, b: 40 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H }, container);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xa = niceTicks(Math.min(...xs), Math.max(...xs)), ya = niceTicks(Math.min(...ys), Math.max(...ys));
  const X = v => m.l + (v - xa.lo) / (xa.hi - xa.lo) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - ya.lo) / (ya.hi - ya.lo)) * (H - m.t - m.b);
  for (const t of ya.ticks) { el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid' }, svg); el('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis' }, svg).textContent = +t.toFixed(2); }
  for (const t of xa.ticks) el('text', { x: X(t), y: H - 22, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = +t.toFixed(3);
  el('text', { x: (W + m.l) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axis-title' }, svg).textContent = `${xLabel} (${xUnit})`;
  // least-squares line
  const n = pts.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (sxx > 0) { const b = sxy / sxx, a = my - b * mx; el('line', { x1: X(xa.lo), y1: Y(a + b * xa.lo), x2: X(xa.hi), y2: Y(a + b * xa.hi), class: 'avg-line' }, svg); }
  const tip = tooltip(container);
  pts.forEach(p => {
    const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 5, class: 'dot' }, svg);
    const h = el('circle', { cx: X(p.x), cy: Y(p.y), r: 14, fill: 'transparent' }, svg);
    const show = () => { const r = svg.getBoundingClientRect(); tip.show(X(p.x) * r.width / W, Y(p.y) * r.height / H, `<b>${fmt(p.y, ydp)} ${yUnit}</b> · ${fmt(p.x, xdp)} ${xUnit}<br>${p.label || ''}`); c.classList.add('on'); };
    h.addEventListener('pointerenter', show); h.addEventListener('pointerdown', show);
    h.addEventListener('pointerleave', () => { tip.hide(); c.classList.remove('on'); });
  });
}
