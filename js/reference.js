// PaceLab — animated 3D reference bowlers (right-arm), viewable from side, front and behind.
// World: x = down the pitch toward the batter, y = up, z = across the pitch. Units: metres.

const T = { to: 0, apex: 0.14, bfc: 0.28, ffc: 0.46, br: 0.56, ft: 0.76, end: 1.0 };
export const KEY_TIMES = T;
export const DURATION = 1.0; // model seconds (real delivery ≈ 0.9–1 s from take-off)

// Body yaw: 0° = side-on (left side to the batter, chest across the pitch), 90° = chest facing the batter.
export const ACTIONS = {
  'side-on': {
    title: 'Side-on', verdict: 'good',
    summary: 'Back foot lands parallel to the crease; hips and shoulders both point down the pitch. The bowler looks over the front shoulder, then rotates hard through release.',
    backFootYaw: 85,
    pelvis: { to: 25, apex: 10, bfc: 10, ffc: 30, br: 95, ft: 130, end: 150 },
    shoulders: { to: 25, apex: 5, bfc: 5, ffc: 20, br: 100, ft: 150, end: 165 },
    lat: 20,
    cues: {
      bfc: ['Back foot parallel to crease', 'Hips & shoulders side-on together', 'Look over front arm'],
      ffc: ['Front leg lands straight', 'Hips start to open before shoulders'],
      br: ['Braced front knee', 'Arm high, trunk flexes over front leg'],
      ft: ['Full rotation, arm finishes past opposite hip'],
    },
  },
  'front-on': {
    title: 'Front-on', verdict: 'good',
    summary: 'Back foot points down the pitch; hips and shoulders both face the batter. The bowler looks inside the front arm. Lower-back load is fine as long as hips and shoulders stay together.',
    backFootYaw: 20,
    pelvis: { to: 55, apex: 60, bfc: 70, ffc: 78, br: 100, ft: 140, end: 155 },
    shoulders: { to: 55, apex: 60, bfc: 65, ffc: 75, br: 100, ft: 150, end: 165 },
    lat: 25,
    cues: {
      bfc: ['Back foot points down pitch', 'Hips & shoulders face batter together', 'Look inside front arm'],
      ffc: ['Front leg lands in line', 'Shoulders stay matched to hips'],
      br: ['Braced front knee', 'Pull front arm down, drive chest through'],
      ft: ['Follow through straight down the pitch'],
    },
  },
  'semi-open': {
    title: 'Semi-open', verdict: 'good',
    summary: 'In between side-on and front-on. Back foot about 45° to the crease, with hips and shoulders aligned to it. A very common, safe action.',
    backFootYaw: 50,
    pelvis: { to: 40, apex: 35, bfc: 40, ffc: 55, br: 98, ft: 135, end: 150 },
    shoulders: { to: 40, apex: 30, bfc: 35, ffc: 45, br: 100, ft: 150, end: 165 },
    lat: 22,
    cues: {
      bfc: ['Back foot ~45° to crease', 'Hips & shoulders aligned at ~45°'],
      ffc: ['Front leg lands straight', 'Hips lead shoulders a little'],
      br: ['Braced front knee', 'Arm high over a firm front side'],
      ft: ['Smooth rotation through the crease'],
    },
  },
  mixed: {
    title: 'Mixed (avoid)', verdict: 'risk',
    summary: 'Hips and back foot are front-on but the shoulders twist back towards side-on (counter-rotation). This twist plus side-bend is strongly linked with lower-back stress fractures in young fast bowlers. Coach toward a matched side-on, semi-open or front-on action.',
    backFootYaw: 25,
    pelvis: { to: 50, apex: 60, bfc: 70, ffc: 80, br: 100, ft: 140, end: 155 },
    shoulders: { to: 40, apex: 30, bfc: 25, ffc: -10, br: 95, ft: 150, end: 165 },
    lat: 40,
    cues: {
      bfc: ['Back foot & hips front-on…', '…but shoulders closed: mismatch'],
      ffc: ['Shoulders twist back (counter-rotation > 30°)', '⚠ Lower-back stress'],
      br: ['Big side-bend to get the arm up', '⚠ Injury risk'],
      ft: ['Fix: match shoulders to hips at back foot contact'],
    },
  },
};

export const VIEWS = {
  side: { label: 'Side', eye: [2.0, 1.15, 6.2], target: [2.0, 1.0, 0], zoom: 1 },
  front: { label: 'Front', eye: [10.5, 1.5, 0.35], target: [2.2, 1.0, 0.35], zoom: 1.45 },
  behind: { label: 'Behind', eye: [-4.5, 1.7, 0.35], target: [2.2, 0.95, 0.35], zoom: 1.2 },
};

// ---------- interpolation ----------
const ORDER = ['to', 'apex', 'bfc', 'ffc', 'br', 'ft', 'end'];
function track(keys) {
  // keys: {eventName: value} or [[t, value], ...]
  const pts = Array.isArray(keys) ? keys : ORDER.filter(k => keys[k] != null).map(k => [T[k], keys[k]]);
  return t => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0; while (pts[i + 1][0] < t) i++;
    const [t1, p1] = pts[i], [t2, p2] = pts[i + 1];
    const p0 = (pts[i - 1] || pts[i])[1], p3 = (pts[i + 2] || pts[i + 1])[1];
    const u = (t - t1) / (t2 - t1);
    // Catmull-Rom (uniform)
    const lerp = (a0, a1, a2, a3) => 0.5 * ((2 * a1) + (-a0 + a2) * u + (2 * a0 - 5 * a1 + 4 * a2 - a3) * u * u + (-a0 + 3 * a1 - 3 * a2 + a3) * u * u * u);
    if (Array.isArray(p1)) return p1.map((_, k) => lerp(p0[k], p1[k], p2[k], p3[k]));
    return lerp(p0, p1, p2, p3);
  };
}
const hold = (from, to, val) => [[from, val], [to, val]];

// Shared motion (same for all actions).
const BOWLER_Z = 0.35;
const pelvisX = track({ to: 0, apex: 0.8, bfc: 1.55, ffc: 2.35, br: 2.62, ft: 3.15, end: 3.9 });
const pelvisY = track({ to: 0.95, apex: 1.12, bfc: 0.93, ffc: 0.88, br: 0.93, ft: 0.8, end: 0.86 });
const trunkFlex = track({ to: 5, apex: 0, bfc: -8, ffc: 2, br: 35, ft: 70, end: 45 });
const armR = track({ to: -150, apex: -120, bfc: -160, ffc: -95, br: 5, ft: 140, end: 200 });
const armL = track({ to: 30, apex: 20, bfc: 75, ffc: 85, br: 160, ft: 185, end: 195 });
// Feet: [x, y(ankle height), z]
const PL = 0.08;
const frontFoot = track([[0, [0.15, PL, BOWLER_Z - 0.05]], [0.06, [0.4, 0.3, BOWLER_Z]], [T.apex, [1.05, 0.5, BOWLER_Z]], [T.bfc, [1.85, 0.45, BOWLER_Z]], [0.38, [2.35, 0.3, BOWLER_Z]], ...hold(T.ffc, T.ft + 0.02, [2.75, PL, BOWLER_Z - 0.05]), [0.9, [3.3, 0.25, BOWLER_Z]], [T.end, [3.75, PL, BOWLER_Z]]]);
const backFoot = track([[0, [-0.35, 0.3, BOWLER_Z + 0.05]], [T.apex, [0.75, 0.35, BOWLER_Z + 0.05]], [0.24, [1.45, 0.14, BOWLER_Z + 0.05]], ...hold(T.bfc, T.ffc + 0.04, [1.6, PL, BOWLER_Z + 0.05]), [T.br, [2.05, 0.18, BOWLER_Z]], [T.ft, [3.2, 0.42, BOWLER_Z - 0.05]], [T.end, [4.15, PL, BOWLER_Z]]]);

// ---------- vector helpers ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rad = d => d * Math.PI / 180;
const UP = [0, 1, 0];
const facing = yaw => [Math.sin(rad(yaw)), 0, Math.cos(rad(yaw))];
const leftOf = yaw => [Math.cos(rad(yaw)), 0, -Math.sin(rad(yaw))];

function legIK(hip, ankle, pole) {
  const L1 = 0.45, L2 = 0.45;
  let d = sub(ankle, hip); let dl = len(d);
  if (dl > L1 + L2 - 1e-4) { d = mul(norm(d), L1 + L2 - 1e-4); ankle = add(hip, d); dl = L1 + L2 - 1e-4; }
  const dir = norm(d);
  const a = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let p = sub(pole, mul(dir, dot(pole, dir))); p = norm(p);
  return { knee: add(add(hip, mul(dir, a)), mul(p, h)), ankle };
}

// Joint positions (MediaPipe-style indices) at model time t.
export function poseAt(actionKey, t) {
  const A = ACTIONS[actionKey];
  const py = track(A.pelvis)(t), sy = track(A.shoulders)(t);
  const lat = track({ to: 0, bfc: 0, ffc: 5, br: A.lat, ft: A.lat * 0.6, end: 10 })(t);
  const P = [pelvisX(t), pelvisY(t), BOWLER_Z];
  const lp = leftOf(py), ls = leftOf(sy), fs = facing(sy);
  const J = {};
  J[23] = add(P, mul(lp, 0.11)); J[24] = add(P, mul(lp, -0.11));
  // Trunk: forward flexion toward the batter (+x) mixed with chest direction, lateral bend toward the non-bowling side.
  const fwd = norm(add(mul([1, 0, 0], 0.7), mul(fs, 0.3)));
  const tf = rad(trunkFlex(t)), tl = rad(lat);
  const tdir = norm(add(add(mul(UP, Math.cos(tf) * Math.cos(tl)), mul(fwd, Math.sin(tf))), mul(ls, Math.sin(tl))));
  const S = add(P, mul(tdir, 0.52));
  J[11] = add(S, mul(ls, 0.19)); J[12] = add(S, mul(ls, -0.19));
  J[0] = add(add(S, mul(tdir, 0.24)), mul(fs, 0.09));
  // Arms rotate in the plane of trunk-up and the shoulder line (over-the-top action).
  const armPos = (sh, ang, side) => {
    const dir = norm(add(mul(tdir, Math.cos(rad(ang))), mul(ls, Math.sin(rad(ang)) * side)));
    return { el: add(sh, mul(dir, 0.3)), wr: add(sh, mul(dir, 0.6)) };
  };
  // Bowling (right) arm: angle 0 = vertical, + = toward the batter side of the shoulder line.
  const r = armPos(J[12], armR(t), 1);
  J[14] = add(r.el, mul(fs, -0.02)); J[16] = r.wr;
  const l = armPos(J[11], armL(t), 1);
  J[13] = add(l.el, mul(fs, 0.04)); J[15] = add(l.wr, mul(fs, 0.06));
  // Legs
  const ff = frontFoot(t), bf = backFoot(t);
  const pole = norm(add([1, 0, 0], mul(facing(py), 0.4)));
  const fl = legIK(J[23], ff, pole), bl = legIK(J[24], bf, pole);
  J[25] = fl.knee; J[27] = fl.ankle; J[26] = bl.knee; J[28] = bl.ankle;
  const footDir = (yaw, ankle) => { const d = [Math.cos(rad(yaw)), 0, Math.sin(rad(yaw))]; return { heel: add(add(ankle, mul(d, -0.06)), [0, -0.06, 0]), toe: add(add(ankle, mul(d, 0.17)), [0, -0.06, 0]) }; };
  const bYaw = track([[0, 10], [T.apex, 30], [T.bfc, A.backFootYaw], [T.ffc + 0.04, A.backFootYaw], [T.ft, 10]])(t);
  const fft = footDir(8, J[27]), bft = footDir(bYaw, J[28]);
  J[29] = fft.heel; J[31] = fft.toe; J[30] = bft.heel; J[32] = bft.toe;
  return { J, pelvisYaw: py, shoulderYaw: sy, lat, trunkFlex: trunkFlex(t) };
}

// ---------- camera + rendering ----------
function camera(view, W, H) {
  const v = VIEWS[view];
  const f = norm(sub(v.target, v.eye));
  const r = norm(cross(f, UP)); const u = cross(r, f);
  const focal = H * 1.9 * (v.zoom || 1);
  return p => {
    const d = sub(p, v.eye);
    const z = dot(d, f); if (z <= 0.1) return null;
    return [W / 2 + dot(d, r) / z * focal, H * 0.55 - dot(d, u) / z * focal, z];
  };
}

const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]];
const COL = { arm: '#e34948', front: '#2a78d6', back: '#eda100', body: '#e8ece9', other: '#9aa59e' };
function boneColor(a, b) {
  const has = s => s.includes(a) && s.includes(b);
  if (has([12, 14, 16])) return COL.arm;
  if (has([23, 25, 27, 29, 31])) return COL.front;
  if (has([24, 26, 28, 30, 32])) return COL.back;
  if (has([11, 13, 15])) return COL.other;
  return COL.body;
}

export function renderModel(ctx, W, H, actionKey, view, t, opts = {}) {
  const proj = camera(view, W, H);
  ctx.fillStyle = '#1c3a2b'; ctx.fillRect(0, 0, W, H);
  // sky band
  const hz = proj([60, 0, 0]) || proj([-60, 0, 0]);
  if (hz && view !== 'side') { ctx.fillStyle = '#16251e'; ctx.fillRect(0, 0, W, Math.max(0, hz[1])); }
  // pitch
  const poly = pts => { const q = pts.map(proj); if (q.some(x => !x)) return; ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
  const x0 = view === 'behind' ? -3.5 : -6, x1 = view === 'front' ? 9.5 : 22;
  ctx.fillStyle = '#b9a77a'; poly([[x0, 0, -1.52], [x1, 0, -1.52], [x1, 0, 1.52], [x0, 0, 1.52]]); ctx.fill();
  ctx.strokeStyle = '#f5f5f0'; ctx.lineWidth = Math.max(1.5, W / 400);
  const line = (a, b) => { const p = proj(a), q = proj(b); if (!p || !q) return; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
  line([1.58, 0, -1.32], [1.58, 0, 1.32]); // bowling crease (stumps)
  line([2.8, 0, -1.8], [2.8, 0, 1.8]); // popping crease
  line([1.58, 0, 1.32], [2.8, 0, 1.32]); line([1.58, 0, -1.32], [2.8, 0, -1.32]); // return creases
  // stumps (non-striker's end) and far stumps
  ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = Math.max(2, W / 260);
  for (const x of [1.58, 21.7]) for (const z of [-0.11, 0, 0.11]) line([x, 0, z], [x, 0.71, z]);
  const { J, pelvisYaw, shoulderYaw, lat } = poseAt(actionKey, t);
  // shadow
  const sh = [23, 24, 27, 28].map(k => proj([J[k][0], 0, J[k][2]])).filter(Boolean);
  if (sh.length) { const cx = sh.reduce((a, p) => a + p[0], 0) / sh.length, cy = sh.reduce((a, p) => a + p[1], 0) / sh.length; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, cy, W / 14, W / 70, 0, 0, 7); ctx.fill(); }
  // bones sorted far→near
  const P = {}; for (const k in J) P[k] = proj(J[k]);
  const bones = BONES.filter(([a, b]) => P[a] && P[b]).map(([a, b]) => ({ a, b, z: (P[a][2] + P[b][2]) / 2 })).sort((x, y) => y.z - x.z);
  const thick = z => Math.max(3, (H / 55) * (8 / z));
  ctx.lineCap = 'round';
  for (const { a, b, z } of bones) {
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = thick(z) + 3;
    ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
    ctx.strokeStyle = boneColor(a, b); ctx.lineWidth = thick(z);
    ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
  }
  if (P[0]) { ctx.fillStyle = '#e8ece9'; ctx.beginPath(); ctx.arc(P[0][0], P[0][1], thick(P[0][2]) * 1.6, 0, 7); ctx.fill(); }
  // hip & shoulder lines extended (alignment guide)
  if (opts.alignment !== false) {
    const ext = (a, b, col) => { const m = mul(add(J[a], J[b]), 0.5), d = norm(sub(J[a], J[b])); const p = proj(add(m, mul(d, 0.42))), q = proj(add(m, mul(d, -0.42))); if (!p || !q) return; ctx.setLineDash([6, 5]); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); };
    ext(23, 24, '#7fd1a8'); ext(11, 12, '#f2c14e');
  }
  // ball near release
  if (t < T.br + 0.005) { const w = P[16]; if (w) { ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(w[0], w[1], thick(w[2]) * 0.9, 0, 7); ctx.fill(); } }
  else { const k = (t - T.br) * 30; const b = proj([2.9 + k * 6.5, Math.max(0.2, 2.2 - k * 0.55), BOWLER_Z - 0.2]); if (b && k < 2.8) { ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(b[0], b[1], Math.max(3, H / 90 * 8 / b[2]), 0, 7); ctx.fill(); } }
  const sep = pelvisYaw - shoulderYaw;
  return { pelvisYaw, shoulderYaw, sep, lat, frontKnee: kneeAngle(J[23], J[25], J[27]), backKnee: kneeAngle(J[24], J[26], J[28]) };
}
function kneeAngle(h, k, a) { const u = norm(sub(h, k)), v = norm(sub(a, k)); return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 / Math.PI; }

export function phaseAt(t) {
  if (t < T.apex) return 'Take-off / bound';
  if (t < T.bfc) return 'Bound';
  if (t < T.ffc) return 'Back foot contact → front foot';
  if (t < T.br) return 'Front foot contact → release';
  if (t < T.ft + 0.05) return 'Release → follow-through';
  return 'Follow-through';
}
export function nearestCue(actionKey, t) {
  const A = ACTIONS[actionKey];
  let best = null;
  for (const k of ['bfc', 'ffc', 'br', 'ft']) if (Math.abs(t - T[k]) < 0.045) best = k;
  return best ? { key: best, lines: A.cues[best] } : null;
}
