import './style.css';
import { Euler, Quaternion } from 'three';
import { environments } from './environments';
import { clamp, defaults, estimateEye, parseCalibration, screenSize, smoothEye, type Calibration, type Eye, type FaceObservation } from './geometry';
import { Orientation, screenAngle } from './orientation';
import { PortalRenderer } from './renderer';
import { EyeTracker } from './tracking';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    portal: '<path d="M5 21V9a7 7 0 0 1 14 0v12M9 21V10a3 3 0 0 1 6 0v11"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    scenes: '<path d="M3 17 9 10l4 4 3-3 5 6M3 5h18v15H3z"/><circle cx="16" cy="9" r="1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    tune: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
    center: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="3"/>',
    exit: '<path d="M9 4H4v16h5m4-13 5 5-5 5m-5-5h13"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="atmosphere" aria-hidden="true"></div>
  <section id="welcome" class="welcome" aria-labelledby="title">
    <div class="portal-mark" aria-hidden="true">${icon('portal')}</div>
    <div class="welcome-copy">
      <h1 id="title">Portal<span class="title-dot">.</span></h1>
      <p class="tagline">给自己片刻，去别处。</p>
      <div class="entry-actions">
        <button id="enter" class="primary">打开这扇窗 ${icon('arrow')}</button>
        <button id="browse" class="text-button">先随便看看</button>
      </div>
      <p id="privacy" class="privacy" hidden>${icon('lock')} 摄像头仅在本机估计眼位，不录制、不上传。</p>
    </div>
    <div class="welcome-foot"><span class="fine-line"></span><span>一扇窗 · 一点留白</span><span class="fine-line"></span></div>
  </section>
  <section id="immersive" hidden aria-label="沉浸模式">
    <header id="scene-caption" class="scene-caption"><span class="scene-number">01 / 02</span><h2 id="scene-name">星海浅眠</h2><span class="caption-line"></span></header>
    <div id="toolbar-area" class="toolbar-area">
      <p id="tracking-status" class="tracking-status" role="status">轻轻拖动，看看别处</p>
      <nav id="toolbar" class="toolbar" aria-label="环境控制">
        <button id="scenes" aria-label="切换环境">${icon('scenes')}<span>环境</span></button>
        <button id="tracking" aria-label="开启眼位追踪" aria-pressed="false">${icon('eye')}<span>随目光</span><i class="indicator"></i></button>
        <button id="calibrate" aria-label="校准">${icon('tune')}<span>校准</span></button>
        <button id="recenter" aria-label="方向回正">${icon('center')}<span>回正</span></button>
        <span class="toolbar-divider"></span>
        <button id="exit" aria-label="退出沉浸">${icon('exit')}<span>返回</span></button>
      </nav>
      <p class="touch-hint">轻触画面，唤出这几个小按钮</p>
    </div>
  </section>
  <dialog id="scene-dialog" aria-labelledby="scene-dialog-title" class="panel scene-panel">
    <div class="panel-heading"><div><p class="eyebrow">SOMEWHERE ELSE</p><h2 id="scene-dialog-title">此刻，想去哪里？</h2></div><button class="icon-button" data-close aria-label="关闭环境选择">${icon('close')}</button></div>
    <div class="scene-options">${environments.map((env, i) => `<button class="scene-option" data-environment="${env.id}" aria-pressed="${i === 0}"><img src="${env.texture}" alt="${env.name}全景预览"/><span class="scene-option-shade"></span><span class="scene-option-copy"><small>0${i + 1}</small><strong>${env.name}</strong><span>${i === 0 ? '漂浮在柔软的宇宙里' : '听见安静，虽然没有声音'}</span></span><span class="scene-selected">${icon('check')}</span></button>`).join('')}</div>
  </dialog>
  <dialog id="calibration-dialog" aria-labelledby="calibration-title" class="panel calibration-panel">
    <div class="panel-heading"><div><p class="eyebrow">MAKE IT YOUR WINDOW</p><h2 id="calibration-title">让这扇窗，更贴近你</h2></div><button class="icon-button" data-close aria-label="关闭校准">${icon('close')}</button></div>
    <p class="panel-description">可以直接使用默认值。想让透视更自然时，调整下面的尺度，再正对屏幕停留片刻。</p>
    <form id="calibration-form">
      <label class="field-label" for="screen-width">显示区域短边 <span>毫米</span></label>
      <div class="input-row"><input id="screen-width" name="width" type="number" min="45" max="350" step="1" required inputmode="decimal"/><span>mm</span></div>
      <p class="field-hint">测量屏幕显示区域的短边，不包含边框。默认 64 mm。</p>
      <label class="field-label" for="eye-distance">眼睛到屏幕的距离 <span>毫米</span></label>
      <div class="input-row"><input id="eye-distance" name="distance" type="number" min="150" max="1000" step="1" required inputmode="decimal"/><span>mm</span></div>
      <p class="field-hint">大约一前臂的距离。默认 350 mm。</p>
      <div class="calibration-state"><span id="face-dot" class="status-dot"></span><span id="calibration-status" role="status">开启眼位追踪后，可以采样校准</span></div>
      <button id="calibration-enable" class="secondary" type="button">开启眼位追踪</button>
      <button class="primary wide" type="submit">保存尺度并采样 ${icon('check')}</button>
      <button id="reset-calibration" class="text-button" type="button">恢复默认尺度</button>
    </form>
    <p class="panel-note">仅保存在这台设备。前置摄像头提供近似眼位，单眼观看更接近真实窗口。</p>
  </dialog>
  <div id="resume-overlay" class="resume-overlay" hidden><div class="resume-card">${icon('portal')}<h2>这扇窗，还在这里。</h2><p>已暂停摄像头与画面</p><button id="resume" class="primary">轻触继续 ${icon('arrow')}</button><button id="resume-exit" class="text-button">返回首页</button></div></div>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <div id="render-error" class="render-error" hidden><p>这台设备暂时无法打开全景。</p><p>请尝试使用 Safari 或 Chrome，并开启硬件加速。</p></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world');
let renderer: PortalRenderer | null = null;
try { renderer = new PortalRenderer(canvas); }
catch { $('render-error').hidden = false; $<HTMLButtonElement>('enter').disabled = true; $<HTMLButtonElement>('browse').disabled = true; }

let calibration: Calibration = { ...defaults };
try { calibration = parseCalibration(JSON.parse(localStorage.getItem('portal-calibration') ?? 'null')); } catch { /* Storage may be blocked. */ }
const orientation = new Orientation();
const tracker = new EyeTracker();
let selected = environments[0];
let mode: 'welcome' | 'immersive' = 'welcome';
let suspended = false;
let trackWanted = false;
let motionWanted = false;
let controls = false;
let hideTimer = 0;
let toastTimer = 0;
let session = 0;
let manualYaw = 0;
let manualPitch = 0;
let face: FaceObservation | null = null;
let observations: { face: FaceObservation; time: number }[] = [];
let lastFaceTime = -Infinity;
let targetEye: Eye = { x: 0, y: 0, z: calibration.distanceMm };
let eye: Eye = { ...targetEye };
let animation = 0;
let lastDraw = 0;
let fpsStart = 0;
let frameCount = 0;
let lastStatus = '';
let longFrameWindows = 0;
let lastStatusTime = 0;
const dialogs = [$<HTMLDialogElement>('scene-dialog'), $<HTMLDialogElement>('calibration-dialog')];

function toast(message: string, duration = 4800) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, duration);
}

function setControls(value: boolean) {
  controls = value;
  document.body.classList.toggle('controls-visible', value);
  $('toolbar-area').inert = !value;
  clearTimeout(hideTimer);
  if (value && !dialogs.some(dialog => dialog.open)) {
    hideTimer = window.setTimeout(() => {
      if ($('toolbar').contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
      setControls(false);
    }, 4000);
  }
}

function openPanel(id: string) {
  setControls(true);
  clearTimeout(hideTimer);
  $<HTMLDialogElement>(id).showModal();
}
dialogs.forEach(dialog => {
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (mode === 'immersive' && !suspended) setControls(true); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
});

function resetEye() {
  face = null;
  observations = [];
  lastFaceTime = -Infinity;
  targetEye = { x: 0, y: 0, z: calibration.distanceMm };
}

function status() {
  const recent = tracker.state === 'ready' && performance.now() - lastFaceTime < 650;
  const text = tracker.state === 'loading' ? '正在准备眼位追踪 · 可以先看看风景' :
    recent ? '视线已连接 · 轻轻移动头部' :
    tracker.state === 'ready' ? '等待你回到镜头前 · 画面会保持安静' :
    orientation.available ? '随手机转动 · 也可以拖动浏览' : '轻轻拖动，看看别处';
  if (text !== lastStatus) { $('tracking-status').textContent = text; lastStatus = text; }
  $('calibration-status').textContent = recent ? '已找到眼位 · 正对屏幕后保存采样' : tracker.state === 'loading' ? '正在准备眼位追踪…' : tracker.state === 'ready' ? '请正对前置摄像头，保持面部在画面内' : '开启眼位追踪后，可以采样校准';
  $('face-dot').classList.toggle('connected', recent);
  $('calibration-enable').hidden = tracker.active;
}

tracker.onFace = observation => {
  if (!observation || mode !== 'immersive' || suspended) return;
  const estimated = estimateEye(observation, calibration, { width: innerWidth, height: innerHeight }, screenAngle());
  if (!estimated || !Object.values(estimated).every(Number.isFinite)) return;
  face = observation;
  lastFaceTime = performance.now();
  observations.push({ face: observation, time: lastFaceTime });
  observations = observations.filter(sample => sample.time > lastFaceTime - 1000).slice(-15);
  targetEye = estimated;
};

tracker.onState = state => {
  const active = state === 'loading' || state === 'ready';
  $('tracking').setAttribute('aria-pressed', String(active));
  $('tracking').setAttribute('aria-label', active ? '关闭眼位追踪' : '开启眼位追踪');
  if (state === 'denied' || state === 'error') {
    trackWanted = false;
    resetEye();
    toast(state === 'denied' ? '摄像头未开启，仍可以转动手机或拖动浏览。' : '眼位追踪暂不可用，仍可以自由浏览环境。');
  }
  status();
};

async function startTracking() {
  trackWanted = true;
  toast('摄像头仅在本机估计眼位，不录制、不上传。', 6000);
  await tracker.start();
}

function enter(withSensors: boolean) {
  if (!renderer) return;
  ++session;
  mode = 'immersive';
  suspended = false;
  motionWanted = withSensors;
  trackWanted = withSensors;
  $('welcome').hidden = true;
  $('immersive').hidden = false;
  document.body.classList.add('immersed');
  resetEye();
  eye = { ...targetEye };
  setControls(true);
  if (withSensors) {
    // Permission must originate in this click handler, without an earlier await.
    const token = session;
    void orientation.start().then(granted => { if (token === session && !granted) status(); });
    void startTracking();
  }
  startAnimation();
}

function exit() {
  ++session;
  mode = 'welcome';
  suspended = false;
  trackWanted = false;
  motionWanted = false;
  tracker.stop();
  orientation.stop();
  resetEye();
  dialogs.forEach(dialog => dialog.close());
  $('resume-overlay').hidden = true;
  $('welcome').hidden = false;
  $('immersive').hidden = true;
  $('toast').hidden = true;
  document.body.classList.remove('immersed');
  setControls(false);
  manualYaw = manualPitch = 0;
  $('enter').focus({ preventScroll: true });
  startAnimation();
}

async function chooseEnvironment(id: string) {
  const environment = environments.find(item => item.id === id)!;
  if (!renderer) return;
  $('scene-name').textContent = '正在打开风景…';
  try {
    if (!await renderer.load(environment)) return;
    selected = environment;
    manualYaw = manualPitch = 0;
    orientation.recenter();
    $('scene-name').textContent = selected.name;
    document.querySelector('.scene-number')!.textContent = `${selected.id === 'dream' ? '01' : '02'} / 02`;
    document.querySelectorAll<HTMLButtonElement>('[data-environment]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.environment === selected.id)));
    document.body.dataset.environment = selected.id;
    document.body.classList.add('scene-ready');
  } catch {
    $('scene-name').textContent = selected.name;
    toast('这片风景暂时没有加载成功，请点环境卡片重试。', 8000);
  }
}

$('enter').addEventListener('click', () => enter(true));
$('browse').addEventListener('click', () => enter(false));
$('exit').addEventListener('click', exit);
$('resume-exit').addEventListener('click', exit);
$('scenes').addEventListener('click', () => openPanel('scene-dialog'));
document.querySelectorAll<HTMLButtonElement>('[data-environment]').forEach(button => button.addEventListener('click', () => { void chooseEnvironment(button.dataset.environment!); $<HTMLDialogElement>('scene-dialog').close(); }));
$('tracking').addEventListener('click', () => {
  if (tracker.active) { trackWanted = false; tracker.stop(); resetEye(); toast('眼位追踪已关闭'); }
  else { void startTracking(); }
  setControls(true);
});
$('calibration-enable').addEventListener('click', () => void startTracking());
$('recenter').addEventListener('click', () => { manualYaw = manualPitch = 0; orientation.recenter(); toast('已回到眼前这片风景'); setControls(true); });
$('calibrate').addEventListener('click', () => {
  $<HTMLInputElement>('screen-width').value = String(calibration.shortEdgeMm);
  $<HTMLInputElement>('eye-distance').value = String(calibration.distanceMm);
  status();
  openPanel('calibration-dialog');
});

function persistCalibration() {
  try { localStorage.setItem('portal-calibration', JSON.stringify(calibration)); }
  catch { toast('当前浏览器不能保存设置，本次体验仍会使用新尺度。'); }
}

$('calibration-form').addEventListener('submit', event => {
  event.preventDefault();
  const next = parseCalibration({ ...calibration, shortEdgeMm: $<HTMLInputElement>('screen-width').valueAsNumber, distanceMm: $<HTMLInputElement>('eye-distance').valueAsNumber });
  const recent = observations.filter(sample => performance.now() - sample.time < 650);
  let sampled = false;
  if (face && recent.length >= 3) {
    const depths = recent.map(({ face: f }) => f.width / (2 * Math.tan(Math.PI / 6)) * 63 * clamp(f.foreshortening, 0.55, 1) / f.eyePixels).sort((a, b) => a - b);
    next.distanceScale = clamp(next.distanceMm / depths[Math.floor(depths.length / 2)], 0.2, 5);
    sampled = true;
  }
  calibration = next;
  persistCalibration();
  resetEye();
  $<HTMLDialogElement>('calibration-dialog').close();
  toast(sampled ? '已记住你的观看距离，慢慢看看吧。' : '已保存显示尺度；找到眼位后，可再次采样校准。');
});
$('reset-calibration').addEventListener('click', () => {
  calibration = { ...defaults };
  persistCalibration();
  resetEye();
  $<HTMLInputElement>('screen-width').value = String(calibration.shortEdgeMm);
  $<HTMLInputElement>('eye-distance').value = String(calibration.distanceMm);
  toast('已恢复默认尺度');
});

$('toolbar').addEventListener('pointerdown', () => setControls(true));
$('toolbar').addEventListener('focusin', () => setControls(true));
let pointer: { id: number; x: number; y: number; distance: number } | null = null;
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'immersive' || suspended || pointer) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  pointer.distance += Math.abs(dx) + Math.abs(dy);
  const sensitivity = tracker.active || orientation.available ? 0.0015 : 0.003;
  manualYaw += dx * sensitivity;
  manualPitch = clamp(manualPitch + dy * sensitivity, -1.35, 1.35);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
canvas.addEventListener('pointerup', event => {
  if (pointer?.id !== event.pointerId) return;
  if (pointer.distance < 8) setControls(!controls);
  pointer = null;
});
canvas.addEventListener('pointercancel', () => { pointer = null; });
window.addEventListener('keydown', event => {
  if (mode !== 'immersive' || suspended || dialogs.some(dialog => dialog.open)) return;
  if (event.key === 'Escape') setControls(!controls);
  if (event.key === 'Tab') setControls(true);
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    manualYaw += event.key === 'ArrowLeft' ? 0.05 : event.key === 'ArrowRight' ? -0.05 : 0;
    manualPitch = clamp(manualPitch + (event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0), -1.35, 1.35);
  }
});

function suspend() {
  cancelAnimationFrame(animation);
  animation = 0;
  if (mode !== 'immersive' || suspended) return;
  ++session;
  suspended = true;
  tracker.stop();
  orientation.stop();
  resetEye();
  pointer = null;
  dialogs.forEach(dialog => dialog.close());
  setControls(false);
  $('resume-overlay').hidden = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
  else if (mode === 'welcome') startAnimation();
});
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', () => { if (mode === 'welcome') startAnimation(); });
$('resume').addEventListener('click', () => {
  suspended = false;
  $('resume-overlay').hidden = true;
  const token = ++session;
  if (motionWanted) void orientation.start().then(() => { if (token === session) status(); });
  if (trackWanted) void startTracking();
  setControls(true);
  startAnimation();
});
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); suspend(); $('render-error').hidden = false; });
canvas.addEventListener('webglcontextrestored', () => { $('render-error').hidden = true; if (mode === 'welcome') startAnimation(); });

function draw(now: number) {
  animation = 0;
  if (document.hidden || suspended || !renderer) return;
  const dt = Math.min((now - lastDraw) / 1000 || 1 / 60, 0.1);
  lastDraw = now;
  const size = screenSize(innerWidth, innerHeight, calibration.shortEdgeMm);
  const exploring = mode === 'welcome' || (!tracker.active && !orientation.available);
  let renderEye: Eye;
  if (exploring) {
    const fov = mode === 'welcome' ? (innerWidth > innerHeight ? 92 : 68) : (innerWidth > innerHeight ? 68 : 43);
    renderEye = { x: 0, y: 0, z: size.width / (2 * Math.tan(fov * Math.PI / 360)) };
  } else {
    if (now - lastFaceTime > 650) targetEye = { x: 0, y: 0, z: calibration.distanceMm };
    eye = smoothEye(eye, targetEye, dt);
    renderEye = eye;
  }
  const base = new Quaternion().setFromEuler(new Euler(manualPitch + (exploring ? 0.10 : 0), -selected.initialYaw + manualYaw + (mode === 'welcome' ? .28 : 0), 0, 'YXZ'));
  if (mode === 'immersive') base.multiply(orientation.rotation);
  renderer.draw(renderEye, size, base);
  if (mode === 'immersive') {
    if (now - lastStatusTime > 200) { status(); lastStatusTime = now; }
    frameCount++;
    if (now - fpsStart > 3000) {
      const fps = frameCount * 1000 / (now - fpsStart);
      longFrameWindows = fps < 30 ? longFrameWindows + 1 : 0;
      if (longFrameWindows >= 2) { renderer.lowerResolution(); tracker.slowDown(); longFrameWindows = 0; }
      fpsStart = now;
      frameCount = 0;
    }
  }
  animation = requestAnimationFrame(draw);
}
function startAnimation() {
  if (!animation && !document.hidden && !suspended) { lastDraw = performance.now(); fpsStart = lastDraw; frameCount = 0; animation = requestAnimationFrame(draw); }
}

setControls(false);
void chooseEnvironment(selected.id);
startAnimation();
