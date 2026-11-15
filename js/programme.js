// Cobras — problem/fix library and 12-week winter schedule,
// taken from Ben's "Young Fast Bowlers: Biomechanics Coaching Programme".

// Faults 1–4 are injury-risk faults and come before performance faults (5–12).
export const FAULTS = [
  { id: 1, name: 'Mixed action', see: 'Hips front-on at back foot contact, shoulders side-on (or the other way round), then shoulders twist back', cause: 'Back-foot placement fighting natural alignment; copying a hero', cue: 'Hips and chest point the same way at back foot', drills: ['Back-foot alignment drill on lines/mat', 'Walk-through 3-step with pause at BFC', 'Mirror freeze', 'Rotate back foot to suit hips'] },
  { id: 2, name: 'Excessive shoulder counter-rotation', see: 'Shoulders rotate away from the batter between BFC and FFC (over 30°)', cause: 'Trying to look side-on; weak trunk control', cue: 'Front arm and chest stay on target line', drills: ['Wall-facing front-arm drill', 'Pallof press 3×8 each side', 'Dead bug 3×8', 'Medicine-ball side-on throws without twist'] },
  { id: 3, name: 'Collapsing front knee', see: 'Front knee flexes deeply after front foot contact', cause: 'Weak quads/glutes; overstriding; slow approach', cue: 'Plant and push tall', drills: ['Bound-and-brace onto front foot', 'Split-squat isometric 3×20 s', 'Step-downs 3×8', 'Drop-land and stick 3×5'] },
  { id: 4, name: 'Hyperextension / side-flexion at release', see: 'Big lateral lean or arched back at release', cause: 'Chasing height or pace; weak lateral trunk', cue: 'Tall and over the front leg', drills: ['Side plank 3×20–30 s', 'Suitcase carry 3×20 m', 'Tall-kneeling throws', 'Reduce run-up speed while re-patterning'] },
  { id: 5, name: 'Inconsistent / too long run-up', see: 'Strides vary; no-balls; slowing at the crease', cause: 'No marked run-up; trying too hard', cue: 'Smooth to quick', drills: ['Run-up marking session', 'Acceleration ladder', '10 m sprints ×6', 'Run-throughs with no ball'] },
  { id: 6, name: 'High or long gather / jump', see: 'Big vertical leap; landing on heel', cause: 'Mistaking height for pace', cue: 'Long and low, not high', drills: ['Bound onto a cone', 'Skipping-to-bound drill', 'Pogo hops 3×10'] },
  { id: 7, name: 'Head falling away', see: 'Head moves off the target line at release', cause: 'Weak front arm; poor alignment; fatigue', cue: 'Eyes level, head over front knee', drills: ['Target-ball bowling (hit cone)', 'Front-arm pull to chest drill', 'Bowling at a single stump'] },
  { id: 8, name: 'Weak / dropped front arm', see: 'Front arm drops early or swings across the body', cause: 'No front arm to pull against', cue: 'Reach high, pull it down into the pocket', drills: ['Front-arm holds 3 s at BFC', 'Band row 3×12', 'Partner-held front-arm walk-throughs'] },
  { id: 9, name: 'Front foot across the body', see: 'Front foot lands across the target line (bowling "around the corner")', cause: 'Mixed action; poor run-up line', cue: 'Front foot on the line, toe to the batter', drills: ['Bowling down a taped line', 'Gates of cones at FFC', 'Video check each set'] },
  { id: 10, name: 'Falling away in follow-through', see: 'Spins off sideways, stops dead', cause: 'Poor balance; incomplete rotation', cue: 'Follow the ball to the batter', drills: ['Follow-through through cone gate', 'Single-leg balance 3×30 s', 'Bowl-and-run 5 m on line'] },
  { id: 11, name: 'Low arm / round arm', see: 'Bowling arm short of vertical at release', cause: 'Tight shoulder/thoracic spine; alignment', cue: 'Brush the ear', drills: ['Thoracic rotation on foam roller 2×10', 'Wall slides 2×10', 'Standing one-step bowling'] },
  { id: 12, name: 'Lack of pace / no hit at crease', see: 'Smooth but slow; soft front leg', cause: 'Low run-up speed; weak brace; limited strength', cue: 'Build speed into the crease, then a hard brace', drills: ['Speed-to-brace drills', 'Medicine-ball overhead throws 3×6', 'Broad jumps 3×5', 'Radar or tape-on-bounce feedback'] },
];
export const FAULT_BY_ID = Object.fromEntries(FAULTS.map(f => [f.id, f]));
// Faults the app measures from side-on video. The rest need the coach's eye (front-on / behind).
export const MEASURED = [2, 3, 5, 12];

// Which library fault a red/amber measurement points to.
export function faultsForMetric(key, value, targets) {
  switch (key) {
    case 'counter_rot': return [2];
    case 'fk_knee_ffc': case 'fk_knee_br': case 'fk_change': case 'fk_flex': return [3];
    case 'approach': return [5, 12];
    case 'stride_pct': { const t = targets?.stride_pct; return t && value > t.hi ? [3] : [12]; }
    case 'speed': case 'sep_max': case 'trunk_flex': case 'arm_vel': case 'seq_ok': return [12];
    default: return [];
  }
}

// lights: { metricKey: {light} }, metrics: values → [{ fault, level:'red'|'amber', because:[metric keys] }] in library priority order.
export function drillsFor(lights, metrics, targets) {
  const hit = {};
  for (const k in lights) {
    const l = lights[k].light;
    if (l === 'green') continue;
    for (const id of faultsForMetric(k, metrics[k], targets)) {
      const h = (hit[id] ||= { fault: FAULT_BY_ID[id], level: 'amber', because: [] });
      if (l === 'red') h.level = 'red';
      h.because.push(k);
    }
  }
  return Object.values(hit).sort((a, b) => a.fault.id - b.fault.id);
}

export const WEEKS = [
  { w: 1, block: 'Assess', skill: 'Film all bowlers; screen; assign each bowler 1–2 priority faults', sc: 'Movement screen; baseline sprint and jump', balls: '12–18 (filming only)' },
  { w: 2, block: 'Re-pattern', skill: 'Walk-throughs and 3-step drills on priority fault; no full run-up', sc: 'Trunk control (dead bug, Pallof, side plank)', balls: '18–24' },
  { w: 3, block: 'Re-pattern', skill: 'Short run-up (5–7 strides) with priority cue', sc: 'Trunk + single-leg (split squat, step-down)', balls: '24' },
  { w: 4, block: 'Re-pattern', skill: 'Short run-up; re-film and compare to week 1', sc: 'Landing mechanics (drop-and-stick)', balls: '24–30' },
  { w: 5, block: 'Build', skill: 'Measure and mark full run-up; run-throughs', sc: 'Lower-body strength; acceleration 10 m sprints', balls: '30' },
  { w: 6, block: 'Build', skill: 'Full run-up at 70%; target bowling', sc: 'Add pogo hops and bounds', balls: '30–36' },
  { w: 7, block: 'Build', skill: 'Full run-up at 80%; front arm and head position', sc: 'Medicine-ball throws (overhead, rotational)', balls: '36' },
  { w: 8, block: 'Build', skill: 'Re-film; second fault if first is stable', sc: 'Deload week: halve strength sets', balls: '24–30 (deload)' },
  { w: 9, block: 'Transfer', skill: 'Full pace in short spells (3-over blocks)', sc: 'Power: broad jumps, med-ball', balls: '36' },
  { w: 10, block: 'Transfer', skill: 'Scenario bowling: plan an over (line, length, variation)', sc: 'Maintain strength; repeat-sprint', balls: '36–42 (U17 only to 42)' },
  { w: 11, block: 'Transfer', skill: 'Spells against batters; pressure and accuracy scoring', sc: 'Maintain', balls: '36–42' },
  { w: 12, block: 'Review', skill: 'Final film vs week 1; individual summer plan', sc: 'Retest sprint and jump', balls: '24–30' },
];
export const FILM_WEEKS = [1, 4, 8, 12];

export function weekFor(startISO, todayISO) {
  const d = (new Date(todayISO + 'T12:00') - new Date(startISO + 'T12:00')) / 864e5;
  return Math.floor(d / 7) + 1; // <1 = not started, >12 = finished
}
// Working net-session cap by age (from the programme's welfare section; check current ECB guidance).
export function ballCap(age) {
  if (age == null) return null;
  if (age <= 13) return 30;
  if (age <= 15) return 36;
  if (age <= 17) return 42;
  return null;
}
