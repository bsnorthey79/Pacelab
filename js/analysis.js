// PaceLab — biomechanics analysis (pure functions, no DOM).
// Input: per-frame pose landmarks from MediaPipe Pose.
// Coordinates: image landmarks in pixels (x right, y down); world landmarks in metres (hip-centred).

export const L = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28, lHeel: 29, rHeel: 30, lToe: 31, rToe: 32,
};

export const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

// Segment-length ratio: thigh + shank ≈ 0.491 × standing height (Winter anthropometrics).
const LEG_TO_HEIGHT = 0.491;

export const EVENTS = [
  { key: 'takeoff', label: 'Take-off', short: 'TO', desc: 'Last foot leaves the ground at the start of the bound/jump' },
  { key: 'bfc', label: 'Back foot contact', short: 'BFC', desc: 'Back foot lands at the end of the bound' },
  { key: 'ffc', label: 'Front foot contact', short: 'FFC', desc: 'Front foot lands' },
  { key: 'br', label: 'Ball release', short: 'BR', desc: 'Ball leaves the hand (approximated as the highest point of the bowling hand)' },
];

// Metric definitions. `pace` = direction that research generally associates with higher ball speed (null = no clear link).
export const METRICS = [
  { key: 'speed', label: 'Ball speed', unit: 'km/h', group: 'Result', dp: 1, pace: 'higher', desc: 'Entered from a speed gun / radar. Used to see which movement changes go with extra pace.' },

  { key: 't_flight', label: 'Bound (flight) time', unit: 's', group: 'Timing', dp: 3, pace: null, desc: 'Take-off to back foot contact.' },
  { key: 't_stride', label: 'Delivery stride time', unit: 's', group: 'Timing', dp: 3, pace: null, desc: 'Back foot contact to front foot contact.' },
  { key: 't_ffc_br', label: 'Front foot to release', unit: 's', group: 'Timing', dp: 3, pace: null, desc: 'Front foot contact to ball release — how quickly energy is transferred up the chain once the front leg plants.' },
  { key: 't_bfc_br', label: 'Back foot to release', unit: 's', group: 'Timing', dp: 3, pace: null, desc: 'Total delivery time from back foot contact to release.' },

  { key: 'approach', label: 'Approach speed', unit: 'm/s', group: 'Run-up', dp: 1, pace: 'higher', desc: 'Hip speed just before take-off. Needs player height and a fixed (non-panning) camera.' },
  { key: 'stride_pct', label: 'Stride length', unit: '% height', group: 'Run-up', dp: 0, pace: null, desc: 'Back-foot landing position to front-foot landing position, as a percentage of standing height.' },
  { key: 'stride_cm', label: 'Stride length', unit: 'cm', group: 'Run-up', dp: 0, pace: null, desc: 'Needs player height.' },

  { key: 'bk_knee_bfc', label: 'Back knee at BFC', unit: '°', group: 'Legs', dp: 0, pace: null, desc: 'Back knee angle as the back foot lands (180° = straight).' },
  { key: 'fk_knee_ffc', label: 'Front knee at FFC', unit: '°', group: 'Legs', dp: 0, pace: null, desc: 'Front knee angle as the front foot lands (180° = straight).' },
  { key: 'fk_knee_br', label: 'Front knee at release', unit: '°', group: 'Legs', dp: 0, pace: 'higher', desc: 'A straighter (braced) front leg at release is consistently linked with higher ball speed.' },
  { key: 'fk_flex', label: 'Front knee collapse', unit: '°', group: 'Legs', dp: 0, pace: 'lower', desc: 'How much the front knee bends after landing (FFC angle minus the most-bent angle before release).' },
  { key: 'fk_change', label: 'Front knee FFC→release', unit: '°', group: 'Legs', dp: 0, pace: 'higher', desc: 'Positive = leg extends (braces) between landing and release; negative = it flexes.' },

  { key: 'trunk_br', label: 'Trunk forward lean at release', unit: '°', group: 'Trunk', dp: 0, pace: 'higher', desc: 'Angle of the trunk from vertical at release, toward the batter.' },
  { key: 'trunk_flex', label: 'Trunk flexion FFC→release', unit: '°', group: 'Trunk', dp: 0, pace: 'higher', desc: 'How far the trunk tips forward between front foot contact and release.' },
  { key: 'sh_align_bfc', label: 'Shoulder alignment at BFC', unit: '°', group: 'Trunk', dp: 0, pace: null, desc: 'Estimate. 0° = fully side-on, 90° = chest facing the batter.' },
  { key: 'hip_align_bfc', label: 'Hip alignment at BFC', unit: '°', group: 'Trunk', dp: 0, pace: null, desc: 'Estimate. 0° = fully side-on, 90° = facing the batter.' },
  { key: 'sep_max', label: 'Max hip–shoulder separation', unit: '°', group: 'Trunk', dp: 0, pace: 'higher', desc: 'Estimate. Largest lead of hips over shoulders between BFC and release.' },
  { key: 'counter_rot', label: 'Shoulder counter-rotation', unit: '°', group: 'Trunk', dp: 0, pace: null, risk: 30, desc: 'Estimate. How far the shoulders twist back toward side-on after BFC. Above ~30° is linked with lower-back injury risk (mixed action).' },

  { key: 'arm_vel', label: 'Peak arm speed', unit: '°/s', group: 'Arm', dp: 0, pace: 'higher', desc: 'Peak angular velocity of the bowling arm (shoulder→wrist) in the side view.' },
  { key: 'release_h', label: 'Release height', unit: '% height', group: 'Arm', dp: 0, pace: null, desc: 'Height of the bowling hand above the ground at release, as % of standing height.' },
  { key: 'elbow_ext', label: 'Elbow extension (indicative)', unit: '°', group: 'Arm', dp: 0, pace: null, desc: 'Change in elbow angle from upper arm horizontal to release, from 2D video. Indicative only — NOT a legality test.' },

  { key: 'seq_pelvis', label: 'Pelvis peak (rel. FFC)', unit: 's', group: 'Sequence', dp: 3, pace: null, desc: 'Time of peak pelvis rotation speed, relative to front foot contact.' },
  { key: 'seq_trunk', label: 'Trunk peak (rel. FFC)', unit: 's', group: 'Sequence', dp: 3, pace: null, desc: 'Time of peak shoulder/trunk rotation speed, relative to front foot contact.' },
  { key: 'seq_arm', label: 'Arm peak (rel. FFC)', unit: 's', group: 'Sequence', dp: 3, pace: null, desc: 'Time of peak arm speed, relative to front foot contact.' },
  { key: 'seq_ok', label: 'Kinematic sequence in order', unit: '', group: 'Sequence', dp: 0, pace: 'higher', bool: true, desc: 'Pelvis peaks before trunk, trunk before arm (proximal-to-distal) — the efficient pattern for transferring energy.' },
];
export const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m]));

// ---------- helpers ----------
const deg = r => r * 180 / Math.PI;
function quantile(arr, q) {
  const a = arr.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return a[lo] + (a[hi] - a[lo]) * (p - lo);
}
function unwrap(arr) {
  const out = arr.slice();
  for (let i = 1; i < out.length; i++) {
    if (!Number.isFinite(out[i]) || !Number.isFinite(out[i - 1])) continue;
    let d = out[i] - out[i - 1];
    while (d > 180) { out[i] -= 360; d -= 360; }
    while (d < -180) { out[i] += 360; d += 360; }
  }
  return out;
}
function fillGaps(arr) {
  const n = arr.length, out = arr.slice();
  let first = out.findIndex(Number.isFinite);
  if (first < 0) return out;
  for (let i = 0; i < first; i++) out[i] = out[first];
  let last = first;
  for (let i = first + 1; i < n; i++) {
    if (Number.isFinite(out[i])) {
      for (let j = last + 1; j < i; j++) out[j] = out[last] + (out[i] - out[last]) * (j - last) / (i - last);
      last = i;
    }
  }
  for (let i = last + 1; i < n; i++) out[i] = out[last];
  return out;
}
export function gaussSmooth(arr, sigma) {
  if (sigma < 0.3) return arr.slice();
  const r = Math.ceil(sigma * 3), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = -r; j <= r; j++) {
      const idx = i + j;
      if (idx < 0 || idx >= n || !Number.isFinite(arr[idx])) continue;
      s += arr[idx] * k[j + r]; w += k[j + r];
    }
    out[i] = w ? s / w : NaN;
  }
  return out;
}
function deriv(arr, t) {
  const n = arr.length, out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dt = t[b] - t[a];
    out[i] = dt > 0 ? (arr[b] - arr[a]) / dt : 0;
  }
  return out;
}
function argExt(arr, a, b, cmp) {
  let best = -1;
  for (let i = Math.max(0, a); i <= Math.min(arr.length - 1, b); i++) {
    if (!Number.isFinite(arr[i])) continue;
    if (best < 0 || cmp(arr[i], arr[best])) best = i;
  }
  return best;
}
const argMin = (arr, a, b) => argExt(arr, a, b, (x, y) => x < y);
const argMax = (arr, a, b) => argExt(arr, a, b, (x, y) => x > y);

// Angle at b (degrees, 0–180) between b→a and b→c in 2D.
function angle2(ax, ay, bx, by, cx, cy) {
  const v1x = ax - bx, v1y = ay - by, v2x = cx - bx, v2y = cy - by;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!d) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))));
}

// ---------- series preparation ----------
// frames: [{ t: seconds(real), lm: Float32Array(33*4) [x,y,z,vis] pixels | null, wl: Float32Array(33*3) | null }]
export function prepareSeries(frames, opts = {}) {
  const n = frames.length;
  const t = frames.map(f => f.t);
  const dt = n > 1 ? (t[n - 1] - t[0]) / (n - 1) : 1 / 30;
  const fps = 1 / dt;
  const sigma = opts.sigmaSec != null ? opts.sigmaSec * fps : Math.max(0.8, 0.008 * fps);

  const raw = { x: [], y: [], v: [], wx: [], wy: [], wz: [] };
  for (let k = 0; k < 33; k++) { for (const key in raw) raw[key].push(new Array(n).fill(NaN)); }
  let detected = 0;
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    if (!f.lm) continue;
    detected++;
    for (let k = 0; k < 33; k++) {
      raw.x[k][i] = f.lm[k * 4]; raw.y[k][i] = f.lm[k * 4 + 1]; raw.v[k][i] = f.lm[k * 4 + 3];
      if (f.wl) { raw.wx[k][i] = f.wl[k * 3]; raw.wy[k][i] = f.wl[k * 3 + 1]; raw.wz[k][i] = f.wl[k * 3 + 2]; }
    }
  }
  // Direction of travel from hip-mid displacement → mirror so travel is +x.
  const hipX = raw.x[23].map((v, i) => (v + raw.x[24][i]) / 2);
  const hx = hipX.filter(Number.isFinite);
  const travelDir = hx.length > 1 && hx[hx.length - 1] < hx[0] ? -1 : 1;
  const W = opts.width || 1;

  const s = { n, t, fps, travelDir, detected, x: [], y: [], v: [], wx: [], wy: [], wz: [] };
  for (let k = 0; k < 33; k++) {
    let xs = fillGaps(raw.x[k]);
    if (travelDir < 0) xs = xs.map(v => W - v);
    s.x.push(gaussSmooth(xs, sigma));
    s.y.push(gaussSmooth(fillGaps(raw.y[k]), sigma));
    s.v.push(fillGaps(raw.v[k]).map(v => (Number.isFinite(v) ? v : 0)));
    let wxs = fillGaps(raw.wx[k]);
    if (travelDir < 0) wxs = wxs.map(v => -v);
    s.wx.push(gaussSmooth(wxs, sigma));
    s.wy.push(gaussSmooth(fillGaps(raw.wy[k]), sigma));
    s.wz.push(gaussSmooth(fillGaps(raw.wz[k]), sigma));
  }
  // Leg length in px (robust upper percentile to limit foreshortening).
  const legs = [];
  for (let i = 0; i < n; i++) {
    for (const [h, kn, a] of [[23, 25, 27], [24, 26, 28]]) {
      legs.push(Math.hypot(s.x[h][i] - s.x[kn][i], s.y[h][i] - s.y[kn][i]) + Math.hypot(s.x[kn][i] - s.x[a][i], s.y[kn][i] - s.y[a][i]));
    }
  }
  s.legPx = quantile(legs, 0.85) || 100;
  return s;
}

export function sides(arm) {
  // Right-arm bowler: bowling arm R, front (lead) leg L.
  const R = arm !== 'L';
  return R
    ? { sh: 12, el: 14, wr: 16, frontHip: 23, frontKnee: 25, frontAnkle: 27, frontHeel: 29, frontToe: 31, backHip: 24, backKnee: 26, backAnkle: 28, backHeel: 30, backToe: 32, leadSh: 11, trailSh: 12, leadHip: 23, trailHip: 24 }
    : { sh: 11, el: 13, wr: 15, frontHip: 24, frontKnee: 26, frontAnkle: 28, frontHeel: 30, frontToe: 32, backHip: 23, backKnee: 25, backAnkle: 27, backHeel: 29, backToe: 31, leadSh: 12, trailSh: 11, leadHip: 24, trailHip: 23 };
}

export function jointAngle(s, i, a, b, c) {
  return angle2(s.x[a][i], s.y[a][i], s.x[b][i], s.y[b][i], s.x[c][i], s.y[c][i]);
}

// ---------- event detection ----------
function footSeries(s, heel, toe) {
  const y = [], x = [];
  for (let i = 0; i < s.n; i++) {
    y.push(Math.max(s.y[heel][i], s.y[toe][i]));
    x.push((s.x[heel][i] + s.x[toe][i]) / 2);
  }
  return { x, y };
}
function contactIntervals(flags, minLen) {
  const out = [];
  let st = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (st < 0) st = i; }
    else if (st >= 0) { if (i - st >= minLen) out.push([st, i - 1]); st = -1; }
  }
  // merge gaps of one frame
  const merged = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && iv[0] - last[1] <= 2) last[1] = iv[1]; else merged.push(iv.slice());
  }
  return merged;
}

export function contactAnalysis(s, arm) {
  const sd = sides(arm);
  const front = footSeries(s, sd.frontHeel, sd.frontToe);
  const back = footSeries(s, sd.backHeel, sd.backToe);
  const win = Math.max(2, Math.round(0.4 * s.fps));
  const ground = new Array(s.n);
  for (let i = 0; i < s.n; i++) {
    let g = -Infinity;
    for (let j = Math.max(0, i - win); j <= Math.min(s.n - 1, i + win); j++) g = Math.max(g, front.y[j], back.y[j]);
    ground[i] = g;
  }
  const tolY = 0.09 * s.legPx, tolV = 1.4 * s.legPx;
  const flags = f => {
    const vx = deriv(f.x, s.t), vy = deriv(f.y, s.t);
    return f.y.map((y, i) => ground[i] - y < tolY && Math.hypot(vx[i], vy[i]) < tolV);
  };
  const minLen = Math.max(2, Math.round(0.02 * s.fps));
  return {
    ground, front, back,
    frontC: contactIntervals(flags(front), minLen),
    backC: contactIntervals(flags(back), minLen),
  };
}

export function detectEvents(s, arm) {
  const sd = sides(arm);
  const ev = { takeoff: null, bfc: null, ffc: null, br: null };
  const notes = [];
  if (s.n < 5 || s.detected < 5) return { events: ev, notes: ['Not enough frames with a detected body.'] };
  const ca = contactAnalysis(s, arm);
  const wy = s.y[sd.wr];
  const shY = s.y[sd.sh];
  const F = sec => Math.round(sec * s.fps);

  // 1. Candidate release: highest bowling hand above shoulder.
  const above = wy.map((v, i) => (v < shY[i] ? v : NaN));
  let br = argMin(above, 0, s.n - 1);
  if (br < 0) { br = argMin(wy, 0, s.n - 1); notes.push('Bowling hand never clearly above shoulder — check release.'); }

  // 2. Front foot contact: latest front-foot contact starting before release (within 0.45 s).
  let ffc = null;
  const fc = ca.frontC.filter(([a]) => a <= br && a >= br - F(0.45));
  if (fc.length) ffc = fc[fc.length - 1][0];
  else {
    const any = ca.frontC.filter(([a]) => a <= br);
    if (any.length) { ffc = any[any.length - 1][0]; notes.push('Front foot contact is a long way before release — check markers.'); }
    else { ffc = Math.max(0, br - F(0.1)); notes.push('Front foot contact not found — estimated.'); }
  }
  // 3. Refine release after FFC: bowling arm (shoulder→wrist) passing vertical,
  //    falling back to the highest hand position.
  const armA = s.x[sd.wr].map((x, i) => deg(Math.atan2(x - s.x[sd.sh][i], s.y[sd.sh][i] - wy[i])));
  let br2 = -1;
  for (let i = Math.max(1, ffc); i <= Math.min(s.n - 1, ffc + F(0.4)); i++) {
    if (armA[i - 1] < 0 && armA[i] >= 0 && wy[i] < shY[i]) { br2 = Math.abs(armA[i - 1]) < Math.abs(armA[i]) ? i - 1 : i; break; }
  }
  if (br2 < 0) br2 = argMin(above, ffc, Math.min(s.n - 1, ffc + F(0.4)));
  if (br2 >= 0) br = br2;

  // 4. Back foot contact: latest back-foot contact that starts before FFC (within 0.6 s).
  let bfc = null;
  const bc = ca.backC.filter(([a]) => a < ffc && a >= ffc - F(0.6));
  if (bc.length) bfc = bc[bc.length - 1][0];
  else notes.push('Back foot contact not found — set it manually.');

  // 5. Take-off: end of the last contact (either foot) before BFC.
  let takeoff = null;
  if (bfc != null) {
    let lastEnd = -1;
    for (const [a, b] of [...ca.frontC, ...ca.backC]) if (b < bfc && b > lastEnd && !(a <= bfc && b >= bfc)) lastEnd = b;
    if (lastEnd >= 0 && bfc - lastEnd <= F(0.8)) takeoff = Math.min(lastEnd + 1, bfc);
    else notes.push('Take-off not in clip — start the clip a little earlier to time the bound.');
  }
  ev.takeoff = takeoff; ev.bfc = bfc; ev.ffc = ffc; ev.br = br;

  // Visibility check
  const keys = [sd.wr, sd.frontKnee, sd.backKnee, sd.frontAnkle, sd.backAnkle];
  const vis = keys.map(k => s.v[k].reduce((a, b) => a + b, 0) / s.n);
  if (Math.min(...vis) < 0.5) notes.push('Some joints were hard to see — results less reliable (light, distance, baggy clothing?).');
  return { events: ev, notes };
}

// ---------- metrics ----------
function rotationSeries(s, a, b) {
  // Transverse-plane angle (deg) of vector a→b in world coords (x along travel, z depth).
  const out = [];
  for (let i = 0; i < s.n; i++) out.push(deg(Math.atan2(s.wz[b][i] - s.wz[a][i], s.wx[b][i] - s.wx[a][i])));
  return unwrap(out);
}

export function computeMetrics(s, events, player = {}, extra = {}) {
  const m = {};
  const sd = sides(player.arm);
  const { takeoff, bfc, ffc, br } = events;
  const T = i => (i == null ? null : s.t[i]);
  const ok = i => i != null && i >= 0 && i < s.n;
  const H = Number(player.heightCm) > 0 ? Number(player.heightCm) / 100 : null;
  const pxPerM = H ? s.legPx / (LEG_TO_HEIGHT * H) : null;
  const F = sec => Math.round(sec * s.fps);

  if (extra.speed != null && extra.speed !== '') m.speed = Number(extra.speed);

  // Timing
  if (ok(takeoff) && ok(bfc)) m.t_flight = T(bfc) - T(takeoff);
  if (ok(bfc) && ok(ffc)) m.t_stride = T(ffc) - T(bfc);
  if (ok(ffc) && ok(br)) m.t_ffc_br = T(br) - T(ffc);
  if (ok(bfc) && ok(br)) m.t_bfc_br = T(br) - T(bfc);

  // Run-up
  const hipMidX = s.x[23].map((v, i) => (v + s.x[24][i]) / 2);
  const anchor = ok(takeoff) ? takeoff : ok(bfc) ? bfc : null;
  if (pxPerM && anchor != null) {
    const a = Math.max(0, anchor - F(0.15));
    if (anchor - a >= 2) m.approach = (hipMidX[anchor] - hipMidX[a]) / (s.t[anchor] - s.t[a]) / pxPerM;
  }
  if (ok(bfc) && ok(ffc)) {
    const bx = (s.x[sd.backHeel][bfc] + s.x[sd.backToe][bfc]) / 2;
    const fx = (s.x[sd.frontHeel][ffc] + s.x[sd.frontToe][ffc]) / 2;
    const ratioLeg = (fx - bx) / s.legPx;
    m.stride_pct = ratioLeg * LEG_TO_HEIGHT * 100;
    if (H) m.stride_cm = m.stride_pct * H;
  }

  // Legs
  const fk = i => jointAngle(s, i, sd.frontHip, sd.frontKnee, sd.frontAnkle);
  const bk = i => jointAngle(s, i, sd.backHip, sd.backKnee, sd.backAnkle);
  if (ok(bfc)) m.bk_knee_bfc = bk(bfc);
  if (ok(ffc)) m.fk_knee_ffc = fk(ffc);
  if (ok(br)) m.fk_knee_br = fk(br);
  if (ok(ffc) && ok(br) && br >= ffc) {
    let mn = Infinity;
    for (let i = ffc; i <= br; i++) mn = Math.min(mn, fk(i));
    m.fk_flex = m.fk_knee_ffc - mn;
    m.fk_change = m.fk_knee_br - m.fk_knee_ffc;
  }

  // Trunk lean (2D side view): hip-mid → shoulder-mid from vertical, + = toward batter.
  const lean = i => {
    const hx = (s.x[23][i] + s.x[24][i]) / 2, hy = (s.y[23][i] + s.y[24][i]) / 2;
    const sx = (s.x[11][i] + s.x[12][i]) / 2, sy = (s.y[11][i] + s.y[12][i]) / 2;
    return deg(Math.atan2(sx - hx, hy - sy));
  };
  if (ok(br)) m.trunk_br = lean(br);
  if (ok(ffc) && ok(br)) m.trunk_flex = lean(br) - lean(ffc);

  // Rotations (3D estimate)
  const shRot = rotationSeries(s, sd.trailSh, sd.leadSh);
  const hipRot = rotationSeries(s, sd.trailHip, sd.leadHip);
  if (ok(bfc) && ok(br)) {
    let dir = Math.sign(shRot[br] - shRot[bfc]) || 1;
    // Opening is measured from side-on (0°); normalise so BFC value lies in (-180,180].
    const norm = v => { let x = v; while (x > 180) x -= 360; while (x <= -180) x += 360; return x; };
    const base = shRot[bfc] - norm(shRot[bfc]);
    const shO = shRot.map(v => dir * (v - base));
    const hipBase = hipRot[bfc] - norm(hipRot[bfc]);
    const hipO = hipRot.map(v => dir * (v - hipBase));
    m.sh_align_bfc = Math.abs(norm(shO[bfc])) > 90 ? 180 - Math.abs(norm(shO[bfc])) : Math.abs(norm(shO[bfc]));
    m.hip_align_bfc = Math.abs(norm(hipO[bfc])) > 90 ? 180 - Math.abs(norm(hipO[bfc])) : Math.abs(norm(hipO[bfc]));
    let sep = -Infinity;
    for (let i = bfc; i <= br; i++) sep = Math.max(sep, hipO[i] - shO[i]);
    m.sep_max = Math.max(0, sep);
    const end = ok(ffc) ? ffc : br;
    let minSh = shO[bfc];
    for (let i = bfc; i <= end; i++) minSh = Math.min(minSh, shO[i]);
    m.counter_rot = shO[bfc] - minSh;

    // Kinematic sequence
    const a = Math.max(0, bfc), b = Math.min(s.n - 1, br + F(0.1));
    const pv = deriv(hipO, s.t), tv = deriv(shO, s.t);
    const ip = argMax(pv, a, b), it = argMax(tv, a, b);
    const ref = ok(ffc) ? s.t[ffc] : s.t[br];
    if (ip >= 0) m.seq_pelvis = s.t[ip] - ref;
    if (it >= 0) m.seq_trunk = s.t[it] - ref;
  }

  // Arm
  const armAng = unwrap(s.x[sd.wr].map((x, i) => deg(Math.atan2(x - s.x[sd.sh][i], s.y[sd.sh][i] - s.y[sd.wr][i]))));
  const armVel = deriv(armAng, s.t);
  if (ok(br)) {
    const a = ok(ffc) ? Math.max(0, ffc - F(0.1)) : Math.max(0, br - F(0.25));
    const ia = argMax(armVel, a, Math.min(s.n - 1, br + F(0.05)));
    if (ia >= 0) {
      m.arm_vel = armVel[ia];
      const ref = ok(ffc) ? s.t[ffc] : s.t[br];
      m.seq_arm = s.t[ia] - ref;
    }
    const ca = contactAnalysis(s, player.arm);
    const gy = ca.ground[br];
    m.release_h = (gy - s.y[sd.wr][br]) / s.legPx * LEG_TO_HEIGHT * 100;

    // Elbow: from upper arm horizontal (behind, on the way up) to release.
    const ua = unwrap(s.x[sd.el].map((x, i) => deg(Math.atan2(x - s.x[sd.sh][i], s.y[sd.sh][i] - s.y[sd.el][i]))));
    let uah = -1;
    for (let i = br; i > Math.max(0, br - F(0.35)); i--) {
      if (ua[i] <= -90) { uah = i; break; } // 0° = straight up, -90° = horizontal behind
    }
    if (uah >= 0) {
      const el = i => jointAngle(s, i, sd.sh, sd.el, sd.wr);
      m.elbow_ext = el(br) - el(uah);
    }
  }
  if (m.seq_pelvis != null && m.seq_trunk != null && m.seq_arm != null) {
    m.seq_ok = (m.seq_pelvis <= m.seq_trunk + 1e-6 && m.seq_trunk <= m.seq_arm + 1e-6) ? 1 : 0;
  }
  for (const k in m) if (!Number.isFinite(m[k])) delete m[k];
  return m;
}

// Values at a single frame for the live readout.
export function frameReadout(s, i, arm) {
  const sd = sides(arm);
  const hx = (s.x[23][i] + s.x[24][i]) / 2, hy = (s.y[23][i] + s.y[24][i]) / 2;
  const sx = (s.x[11][i] + s.x[12][i]) / 2, sy = (s.y[11][i] + s.y[12][i]) / 2;
  return {
    frontKnee: jointAngle(s, i, sd.frontHip, sd.frontKnee, sd.frontAnkle),
    backKnee: jointAngle(s, i, sd.backHip, sd.backKnee, sd.backAnkle),
    elbow: jointAngle(s, i, sd.sh, sd.el, sd.wr),
    trunk: deg(Math.atan2(sx - hx, hy - sy)),
  };
}

export function coachingNotes(m) {
  const out = [];
  if (m.counter_rot != null && m.counter_rot > 30) out.push({ level: 'risk', text: `Shoulder counter-rotation ≈ ${Math.round(m.counter_rot)}° (above ~30°). This "mixed action" pattern is linked with lower-back stress fractures in young fast bowlers — worth checking with a second camera angle and a physio/coach.` });
  if (m.fk_change != null && m.fk_change < -10) out.push({ level: 'tip', text: `Front knee bends ${Math.round(-m.fk_change)}° between landing and release. A firmer, braced front leg is one of the most consistent links with extra pace.` });
  if (m.seq_ok === 0) out.push({ level: 'tip', text: 'Peak speeds are out of order (ideal: pelvis → trunk → arm). Check the markers first; if they are right, look at timing of hip drive and trunk rotation.' });
  if (m.t_ffc_br != null && m.t_ffc_br > 0.2) out.push({ level: 'info', text: 'Front foot to release is long — check the FFC and release markers are on the right frames.' });
  return out;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const tiny = (v, mu) => v / n < 1e-12 * (mu * mu + 1);
  if (tiny(sxx, mx) || tiny(syy, my)) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// ---------- traffic lights ----------
// Guide targets. 'higher': green ≥ g, amber ≥ a. 'lower': green ≤ g, amber ≤ a. 'range': green lo–hi, amber within m outside.
// Values are coaching guides drawn from fast-bowling research on adult/senior bowlers — edit them for juniors in Settings.
export const DEFAULT_TARGETS = {
  fk_knee_ffc: { type: 'higher', g: 160, a: 145, why: 'Front leg should land braced (160–180°).' },
  fk_knee_br: { type: 'higher', g: 160, a: 145, why: 'Braced front leg (≥160°) is linked with higher ball speed.' },
  fk_change: { type: 'higher', g: 0, a: -10, why: 'Front knee should hold or straighten after landing.' },
  fk_flex: { type: 'lower', g: 10, a: 20, why: 'Less collapse of the front knee keeps energy moving up the chain.' },
  counter_rot: { type: 'lower', g: 20, a: 30, why: 'Above ~30° shoulder counter-rotation is linked with lower-back injury.' },
  sep_max: { type: 'higher', g: 30, a: 15, why: 'Hips leading the shoulders stores energy for the trunk to release.' },
  trunk_flex: { type: 'higher', g: 30, a: 15, why: 'Strong forward trunk flexion over a braced front leg adds pace.' },
  stride_pct: { type: 'range', lo: 70, hi: 90, m: 10, why: 'Very short strides lose momentum; very long strides make bracing hard.' },
  approach: { type: 'higher', g: 5, a: 4, why: 'Faster, controlled approach speed carries more momentum into the crease.' },
  seq_ok: { type: 'bool', why: 'Pelvis → trunk → arm in order is the efficient pattern.' },
};
export const LIGHT_LABEL = { green: 'Good', amber: 'Work on', red: 'Focus' };

export function lightFor(key, v, targets = DEFAULT_TARGETS, history = []) {
  if (v == null || !Number.isFinite(v)) return null;
  const t = targets[key];
  if (t) {
    if (t.type === 'bool') return { light: v ? 'green' : 'red', basis: 'guide', why: t.why };
    let light;
    if (t.type === 'higher') light = v >= t.g ? 'green' : v >= t.a ? 'amber' : 'red';
    else if (t.type === 'lower') light = v <= t.g ? 'green' : v <= t.a ? 'amber' : 'red';
    else { const off = v < t.lo ? t.lo - v : v > t.hi ? v - t.hi : 0; light = off === 0 ? 'green' : off <= t.m ? 'amber' : 'red'; }
    return { light, basis: 'guide', why: t.why };
  }
  // No guide: compare with the bowler's own previous deliveries (needs 3+ and a pace direction).
  const def = METRIC_BY_KEY[key];
  const h = history.filter(Number.isFinite);
  if (!def || !def.pace || h.length < 3) return null;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const sd = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / (h.length - 1)) || Math.abs(mean) * 0.03 || 1;
  const z = (v - mean) / sd * (def.pace === 'higher' ? 1 : -1);
  return { light: z >= 0 ? 'green' : z >= -1 ? 'amber' : 'red', basis: 'personal', why: 'Compared with this bowler’s own average.' };
}

// ---------- age bands ----------
// Juniors are rated against eased targets for the measures that depend on size and strength
// (front-leg brace, approach speed, trunk drive). Safety limits (counter-rotation) are the same at every age.
// These band values are coaching estimates, not published norms — edit them in Settings.
export const BANDS = [
  { key: 'u13', label: 'Under 13', max: 12 },
  { key: 'u16', label: '13–15', max: 15 },
  { key: 'u19', label: '16–18', max: 18 },
  { key: 'senior', label: 'Senior', max: Infinity },
];
const BAND_OVERRIDES = {
  u13: { fk_knee_ffc: { g: 145, a: 130 }, fk_knee_br: { g: 145, a: 130 }, fk_change: { g: -10, a: -20 }, fk_flex: { g: 20, a: 30 }, approach: { g: 3.5, a: 2.8 }, trunk_flex: { g: 20, a: 10 }, sep_max: { g: 20, a: 10 } },
  u16: { fk_knee_ffc: { g: 150, a: 135 }, fk_knee_br: { g: 150, a: 135 }, fk_change: { g: -5, a: -15 }, fk_flex: { g: 15, a: 25 }, approach: { g: 4, a: 3.3 }, trunk_flex: { g: 25, a: 12 }, sep_max: { g: 25, a: 12 } },
  u19: { fk_knee_ffc: { g: 155, a: 140 }, fk_knee_br: { g: 155, a: 140 }, fk_change: { g: -5, a: -15 }, fk_flex: { g: 12, a: 22 }, approach: { g: 4.5, a: 3.8 }, trunk_flex: { g: 25, a: 12 }, sep_max: { g: 25, a: 12 } },
  senior: {},
};
export const SAME_ALL_AGES = ['counter_rot', 'stride_pct', 'seq_ok'];
export function bandForAge(age) { return age == null ? BANDS[3] : BANDS.find(b => age <= b.max); }
export function defaultTargets(bandKey) {
  const out = {};
  for (const k in DEFAULT_TARGETS) out[k] = { ...DEFAULT_TARGETS[k], ...((BAND_OVERRIDES[bandKey] || {})[k] || {}) };
  return out;
}
