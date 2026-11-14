// PaceLab — video frame stepping + MediaPipe Pose (runs fully on-device, offline).
/* global Pose */

let pose = null, poseComplexity = null, pending = null;

export async function getPose(complexity = 1) {
  if (!window.Pose) throw new Error('Pose engine failed to load');
  if (!pose) {
    pose = new Pose({ locateFile: f => `mediapipe/${f}` });
    pose.onResults(r => { if (pending) { const p = pending; pending = null; p(r); } });
  }
  if (poseComplexity !== complexity) {
    pose.setOptions({ modelComplexity: complexity, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5, selfieMode: false });
    poseComplexity = complexity;
    await pose.initialize();
  }
  return pose;
}

export async function detect(image) {
  const p = await getPose(poseComplexity ?? 1);
  return new Promise((resolve, reject) => {
    pending = resolve;
    p.send({ image }).catch(e => { pending = null; reject(e); });
  });
}

export function seek(video, t) {
  return new Promise(resolve => {
    if (Math.abs(video.currentTime - t) < 1e-6 && video.readyState >= 2) return resolve();
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

// Load a Blob into a <video>, fixing MediaRecorder WebM files that report Infinity duration.
export async function loadVideo(video, blob) {
  if (video._url) URL.revokeObjectURL(video._url);
  video._url = URL.createObjectURL(blob);
  video.src = video._url;
  video.muted = true; video.playsInline = true;
  await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error('This video format cannot be opened on this phone')); });
  if (!Number.isFinite(video.duration)) {
    await new Promise(res => { video.ondurationchange = () => { if (Number.isFinite(video.duration)) res(); }; video.currentTime = 1e101; setTimeout(res, 3000); });
    await seek(video, 0);
  }
  if (video.readyState < 2) await new Promise(res => { video.onloadeddata = res; setTimeout(res, 2000); });
  return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
}

const COMMON_FPS = [24, 25, 30, 48, 50, 60, 90, 100, 120, 240, 480, 960];
// Frame rate of the file (frames per second of media time), measured with requestVideoFrameCallback.
export async function detectFps(video, start = 0) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return null;
  await seek(video, start);
  const times = [];
  const rate = 0.125;
  const result = await new Promise(resolve => {
    let finished = false;
    const finish = () => { if (finished) return; finished = true; video.pause(); resolve(times); };
    const cb = (now, meta) => {
      times.push(meta.mediaTime);
      if (times.length < 30 && !video.ended) video.requestVideoFrameCallback(cb); else finish();
    };
    video.requestVideoFrameCallback(cb);
    video.playbackRate = rate;
    video.play().catch(finish);
    setTimeout(finish, 4000);
  });
  video.playbackRate = 1;
  const d = [];
  for (let i = 1; i < result.length; i++) { const x = result[i] - result[i - 1]; if (x > 1e-5) d.push(x); }
  if (d.length < 4) return null;
  d.sort((a, b) => a - b);
  const base = d[Math.floor(d.length * 0.5)];
  let fps = 1 / base;
  const snap = COMMON_FPS.find(c => Math.abs(c - fps) / c < 0.06);
  return snap || Math.round(fps);
}

export function drawFrame(video, canvas, maxSide = 1280) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sc = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.round(vw * sc), h = Math.round(vh * sc);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return { w, h };
}

// Analyse [start,end] of the video frame by frame.
// fileFps: frames per second in the file; timeScale: real seconds per media second (slow-mo < 1).
export async function analyseVideo(video, { start, end, fileFps, timeScale = 1, complexity = 1, onProgress, isCancelled }) {
  await getPose(complexity);
  pose.reset && pose.reset();
  const canvas = document.createElement('canvas');
  const frames = [];
  const total = Math.max(1, Math.floor((end - start) * fileFps));
  let dims = null;
  for (let i = 0; i < total; i++) {
    if (isCancelled && isCancelled()) throw new Error('cancelled');
    const mt = start + (i + 0.5) / fileFps;
    await seek(video, mt);
    dims = drawFrame(video, canvas);
    const r = await detect(canvas);
    const f = { t: (mt - start) * timeScale, mt, lm: null, wl: null };
    if (r.poseLandmarks) {
      f.lm = new Float32Array(132);
      r.poseLandmarks.forEach((p, k) => { f.lm[k * 4] = p.x * dims.w; f.lm[k * 4 + 1] = p.y * dims.h; f.lm[k * 4 + 2] = p.z * dims.w; f.lm[k * 4 + 3] = p.visibility ?? 1; });
      if (r.poseWorldLandmarks) {
        f.wl = new Float32Array(99);
        r.poseWorldLandmarks.forEach((p, k) => { f.wl[k * 3] = p.x; f.wl[k * 3 + 1] = p.y; f.wl[k * 3 + 2] = p.z; });
      }
    }
    f.img = await toJpeg(canvas);
    frames.push(f);
    onProgress && onProgress((i + 1) / total, f, canvas);
  }
  return { frames, width: dims?.w || video.videoWidth, height: dims?.h || video.videoHeight };
}

export async function snapshot(video, mt, maxSide = 720) {
  await seek(video, mt);
  const c = document.createElement('canvas');
  drawFrame(video, c, maxSide);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
}

// Small JPEG of a frame for smooth review playback (no video seeking needed).
const STRIP_MAX = 640;
let stripCanvas = null;
export function toJpeg(src) {
  stripCanvas ||= document.createElement('canvas');
  const sc = Math.min(1, STRIP_MAX / Math.max(src.width, src.height));
  const w = Math.round(src.width * sc), h = Math.round(src.height * sc);
  if (stripCanvas.width !== w || stripCanvas.height !== h) { stripCanvas.width = w; stripCanvas.height = h; }
  stripCanvas.getContext('2d').drawImage(src, 0, 0, w, h);
  return new Promise(res => stripCanvas.toBlob(res, 'image/jpeg', 0.75));
}
// Build the frame strip from a stored video (for deliveries analysed before this existed).
export async function makeStrip(video, mts, onProgress, isCancelled) {
  const c = document.createElement('canvas');
  const imgs = [];
  for (let i = 0; i < mts.length; i++) {
    if (isCancelled && isCancelled()) throw new Error('cancelled');
    await seek(video, mts[i]);
    drawFrame(video, c, STRIP_MAX);
    imgs.push(await toJpeg(c));
    onProgress && onProgress((i + 1) / mts.length);
  }
  return imgs;
}
