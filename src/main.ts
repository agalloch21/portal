import './style.css';
import { Euler, Quaternion } from 'three';
import { environments } from './environments';
import { clamp, defaults, estimateEye } from './geometry';
import { DEFAULT_FOV, panoramaView, offAxisEye, parseEyeGain } from './view';
import { Orientation, screenAngle } from './orientation';
import { EyeTracker } from './tracking';
import { EyeFilter } from './eye-filter';
import { EyeMotionFrame } from './eye-motion';
import { PortalRenderer } from './renderer';

document.addEventListener('selectstart', event => event.preventDefault());
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('dragstart', event => event.preventDefault());

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
function updateDisplayMode() {
  document.documentElement.dataset.standalone = String(isStandalone());
  document.querySelector('meta[name="theme-color"]')!.setAttribute('content', isStandalone() ? '#0b0d10' : selected.themeColor);
}

const icon = (name: string) => {
  const paths: Record<string, string> = {
    portal: '<path d="M5 21V9a7 7 0 0 1 14 0v12M9 21V10a3 3 0 0 1 6 0v11"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    scenes: '<path d="M3 17 9 10l4 4 3-3 5 6M3 5h18v15H3z"/><circle cx="16" cy="9" r="1"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M3 8l-2 4 2 4m18-8 2 4-2 4"/>',
    full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
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
        <p class="panel-note">打开后使用前摄估计眼位，仅在本机处理，不录制、不上传。</p>
      </div>
    </div>
    <div class="welcome-foot"><span class="fine-line"></span><span>一扇窗 · 一点留白</span><span class="fine-line"></span></div>
  </section>
  <section id="immersive" hidden aria-label="沉浸模式">
    <header id="scene-caption" class="scene-caption"><span class="scene-number">01 / ${String(environments.length).padStart(2, '0')}</span><h2 id="scene-name">星海浅眠</h2><span class="caption-line"></span></header>
    <div id="toolbar-area" class="toolbar-area">
      <p id="tracking-status" class="tracking-status" role="status">轻轻拖动，看看别处</p>
      <nav id="toolbar" class="toolbar" aria-label="环境控制">
        <button id="scenes" aria-label="切换环境">${icon('scenes')}<span>环境</span></button>
        <button id="motion" aria-label="开启手机跟随" aria-pressed="false">${icon('phone')}<span>随手机</span><i class="indicator"></i></button>
        <button id="view-settings" aria-label="打开体验设置">${icon('tune')}<span>设置</span></button>
        <button id="recenter" aria-label="方向回正">${icon('center')}<span>回正</span></button>
        <span class="toolbar-divider"></span>
        <button id="exit" aria-label="退出沉浸">${icon('exit')}<span>返回</span></button>
      </nav>
      <p class="touch-hint">轻触画面，唤出这几个小按钮</p>
    </div>
  </section>
  <dialog id="scene-dialog" aria-labelledby="scene-dialog-title" class="panel scene-panel">
    <div class="panel-heading"><div><p class="eyebrow">SOMEWHERE ELSE</p><h2 id="scene-dialog-title">此刻，想去哪里？</h2></div><button class="icon-button" data-close aria-label="关闭环境选择">${icon('close')}</button></div>
    <div class="scene-options">${environments.map((env, i) => `<button class="scene-option" data-environment="${env.id}" aria-pressed="${i === 0}"><img src="${env.preview}" alt="${env.name}预览"/><span class="scene-option-shade"></span><span class="scene-option-copy"><small>0${i + 1} · ${env.resolution}</small><strong>${env.name}</strong><span>${env.description}</span></span><span class="scene-selected">${icon('check')}</span></button>`).join('')}</div>
  </dialog>
  <dialog id="view-dialog" aria-labelledby="view-title" class="panel view-panel">
    <div class="panel-heading"><div><p class="eyebrow">MAKE YOURSELF AT HOME</p><h2 id="view-title">自在地看一会儿</h2></div><button class="icon-button" data-close aria-label="关闭体验设置">${icon('close')}</button></div>
    <p class="panel-description">开启眼位后，正对屏幕稍停片刻建立中心，再轻轻移动头部。摄像头仅在本机估计位置，不录制、不上传。</p>
    <button id="eyes" class="secondary" aria-pressed="false">开启眼位追踪</button>
    <button id="eye-center" class="text-button" type="button">重新采样眼位中心</button>
    <p id="eye-status" class="panel-note" role="status">眼位已关闭</p>
    <label for="eye-gain">眼位移动倍率 <output id="eye-gain-value" for="eye-gain">1.0 倍</output></label>
    <input id="eye-gain" type="range" min="0.5" max="3" step="0.1" value="1" />
    <div class="range-labels"><span>0.5 倍</span><span>1 倍 · 默认</span><span>3 倍</span></div>
    <button id="eye-gain-reset" class="text-button" type="button">恢复 1 倍</button>
    <p class="panel-note">调整头部移动的响应幅度，设置仅保存在本机。</p>
    <button id="ambient-motion" class="secondary" type="button" aria-pressed="true">风景微动：开</button>
    <p class="panel-note">星尘、气泡、光束与花瓣会缓慢活动；关闭后，风景静止，眼位跟随仍然保留。</p>
    <details id="performance-details"><summary>性能数据</summary><p id="performance-data" class="panel-note">等待数据</p><p id="viewport-data" class="panel-note"></p><p class="panel-note">追踪频率包含未识别人脸的结果；处理耗时不包含相机曝光与系统采集延迟。</p></details>
    <div class="display-options">
      <button id="fullscreen" class="secondary" type="button">${icon('full')} 全屏显示</button>
      <p id="install-hint" class="panel-description">iPhone 上想收起浏览器栏：在 Safari 中点「分享 → 添加到主屏幕」，再从主屏幕打开 Portal。</p>
    </div>
  </dialog>
  <div id="resume-overlay" class="resume-overlay" hidden><div class="resume-card">${icon('portal')}<h2>这扇窗，还在这里。</h2><p>已暂停手机跟随与画面</p><button id="resume" class="primary">轻触继续 ${icon('arrow')}</button><button id="resume-exit" class="text-button">返回首页</button></div></div>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <div id="render-error" class="render-error" hidden><p>这台设备暂时无法打开全景。</p><p>请尝试使用 Safari 或 Chrome，并开启硬件加速。</p></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world');
let renderer: PortalRenderer | null = null;
try { renderer = new PortalRenderer(canvas); }
catch { $('render-error').hidden = false; $<HTMLButtonElement>('enter').disabled = true; $<HTMLButtonElement>('browse').disabled = true; }

const orientation = new Orientation();
const tracker = new EyeTracker();
const eyeFilter = new EyeFilter();
const eyeMotion = new EyeMotionFrame();
let eyesWanted = false;
let eyeGain = 1;
try { eyeGain = parseEyeGain(JSON.parse(localStorage.getItem('portal-eye-gain') ?? '1')); } catch { /* Storage may be unavailable. */ }
let renderedEyeGain = eyeGain;
function updateEyeGain(value: number) {
  eyeGain = parseEyeGain(value);
  $<HTMLInputElement>('eye-gain').value = String(eyeGain);
  $('eye-gain-value').textContent = `${eyeGain.toFixed(1)} 倍`;
  try { localStorage.setItem('portal-eye-gain', JSON.stringify(eyeGain)); } catch { /* Still usable without storage. */ }
}
updateEyeGain(eyeGain);
$('eye-gain').addEventListener('input', () => updateEyeGain($<HTMLInputElement>('eye-gain').valueAsNumber));
$('eye-gain-reset').addEventListener('click', () => updateEyeGain(1));
let eyeAngle = screenAngle();
let eyeResultReceived = false;
let faceDetected = false;
tracker.onFace = (face, timestamp) => {
  eyeResultReceived = true;
  faceDetected = face !== null;
  const angle = screenAngle();
  if (angle !== eyeAngle) { eyeFilter.reset(); eyeMotion.reset(); eyeAngle = angle; }
  const eye = face ? estimateEye(face, defaults, { width: canvas.clientWidth, height: canvas.clientHeight }, angle) : null;
  if (!eye) { eyeFilter.sample(null, timestamp, performance.now()); return; }
  const observation = eyeMotion.observation(eye, orientation.poseAt(timestamp));
  if (observation.changed) eyeFilter.reset();
  eyeFilter.sample(observation.eye, timestamp, performance.now());
};
tracker.onState = state => {
  if (state === 'denied' || state === 'error') {
    eyesWanted = false;
    eyeFilter.reset(); eyeMotion.reset();
    toast(state === 'denied' ? '摄像头未开启，仍可随手机或拖动浏览。' : '眼位暂时无法使用，仍可继续浏览。');
  }
  status();
};
const welcomeEnvironment = environments.find(env => env.id === 'dream')!;
let preferredEnvironment = environments.find(env => env.id === new URLSearchParams(location.search).get('scene')) ?? welcomeEnvironment;
let selected = welcomeEnvironment;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let ambientMotion = !reducedMotion.matches;
function updateAmbientMotion() {
  renderer?.setAmbientMotion(ambientMotion);
  $('ambient-motion').textContent = `风景微动：${ambientMotion ? '开' : '关'}`;
  $('ambient-motion').setAttribute('aria-pressed', String(ambientMotion));
}
updateAmbientMotion();
$('ambient-motion').addEventListener('click', () => { ambientMotion = !ambientMotion; updateAmbientMotion(); });
reducedMotion.addEventListener('change', () => { ambientMotion = !reducedMotion.matches; updateAmbientMotion(); });
updateDisplayMode();
matchMedia('(display-mode: standalone)').addEventListener('change', updateDisplayMode);
let mode: 'welcome' | 'immersive' = 'welcome';
let suspended = false;
let motionWanted = false;
let controls = false;
let hideTimer = 0;
let toastTimer = 0;
let session = 0;
let manualYaw = 0;
let manualPitch = 0;
let animation = 0;
let lastDraw = 0;
let fpsStart = 0;
let frameCount = 0;
let renderFps = 0;
let renderFrameSeconds = 0;
let lastStatus = '';
let longFrameWindows = 0;
let lastStatusTime = 0;
const dialogs = [$<HTMLDialogElement>('scene-dialog'), $<HTMLDialogElement>('view-dialog')];

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

function status() {
  if ($<HTMLDetailsElement>('performance-details').open) {
    const metrics = tracker.metrics;
    $('performance-data').textContent = `渲染 ${renderFps.toFixed(0)} fps · 追踪 ${metrics.hz.toFixed(1)} 次/秒 · 处理 ${metrics.latency.toFixed(0)} ms · ${metrics.mode}`;
    const box = canvas.getBoundingClientRect();
    const visual = window.visualViewport;
    $('viewport-data').textContent = `${isStandalone() ? '主屏幕' : '浏览器'} · 屏幕 ${screen.width}×${screen.height} · 页面 ${innerWidth}×${innerHeight} · 可见高度 ${Math.round(visual?.height ?? innerHeight)} · 可见偏移 ${Math.round(visual?.offsetTop ?? 0)} · 画布顶部 ${Math.round(box.top)} / 底部 ${Math.round(box.bottom)}`;
  }
  const eyeText = tracker.state === 'loading' ? '正在准备眼位追踪' : tracker.state === 'ready' ?
    !eyeResultReceived ? '正在寻找眼睛' : !faceDetected ? '等待眼睛进入画面，画面位置已保持' :
    !eyeFilter.calibrated ? '正对屏幕稍停片刻，正在采样眼位' : eyeFilter.visible(performance.now()) ? '眼位跟随中' : '暂未找到眼睛，正对屏幕即可继续' : '眼位已关闭';
  const text = orientation.aligning ? '稍停片刻，正在对齐方向' :
    orientation.available ? `随手机轻轻转动 · ${eyeText}` :
    motionWanted ? `等待手机方向 · ${eyesWanted ? eyeText : '关闭随手机可拖动'}` : eyesWanted ? eyeText : '轻轻拖动，看看别处';
  $('eye-status').textContent = eyeText;
  $('eyes').textContent = eyesWanted ? '关闭眼位追踪' : '开启眼位追踪';
  $('eyes').setAttribute('aria-pressed', String(eyesWanted));
  $<HTMLButtonElement>('eye-center').disabled = !eyesWanted;
  if (text !== lastStatus) { $('tracking-status').textContent = text; lastStatus = text; }
  $('motion').setAttribute('aria-pressed', String(motionWanted));
  $('motion').setAttribute('aria-label', motionWanted ? '关闭手机跟随' : '开启手机跟随');
}

async function startMotion() {
  motionWanted = true;
  const token = session;
  status();
  const granted = await orientation.start();
  if (token !== session) return;
  if (!granted) {
    motionWanted = false;
    toast('手机方向未开启，仍可以拖动浏览。');
  }
  status();
}

function enter(withSensors: boolean) {
  if (!renderer) return;
  ++session;
  mode = 'immersive';
  void chooseEnvironment(preferredEnvironment.id);
  suspended = false;
  motionWanted = withSensors;
  $('welcome').hidden = true;
  $('immersive').hidden = false;
  document.body.classList.add('immersed');
  setControls(true);
  if (withSensors) { void startMotion(); startEyes(); }
  else status();
  startAnimation();
}

function exit() {
  ++session;
  mode = 'welcome';
  void chooseEnvironment(welcomeEnvironment.id);
  suspended = false;
  motionWanted = false;
  eyesWanted = false;
  tracker.stop();
  eyeFilter.reset(); eyeMotion.reset();
  orientation.stop();
  orientation.recenter();
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
    if (mode === 'immersive') {
      preferredEnvironment = selected;
      const url = new URL(location.href);
      url.searchParams.set('scene', selected.id);
      history.replaceState(null, '', url);
    }
    manualYaw = manualPitch = 0;
    orientation.recenter();
    $('scene-name').textContent = selected.name;
    document.querySelector('.scene-number')!.textContent = `${String(environments.indexOf(selected) + 1).padStart(2, '0')} / ${String(environments.length).padStart(2, '0')}`;
    document.querySelectorAll<HTMLButtonElement>('button[data-environment]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.environment === selected.id)));
    document.body.dataset.environment = selected.id;
    document.documentElement.style.setProperty('--scene-background', selected.themeColor);
    updateDisplayMode();
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
document.querySelectorAll<HTMLButtonElement>('button[data-environment]').forEach(button => button.addEventListener('click', () => { void chooseEnvironment(button.dataset.environment!); $<HTMLDialogElement>('scene-dialog').close(); }));
$('motion').addEventListener('click', () => {
  if (motionWanted) {
    ++session;
    motionWanted = false;
    orientation.stop();
    status();
    toast('手机跟随已暂停，画面停留在这里。');
  } else void startMotion();
  setControls(true);
});
$('recenter').addEventListener('click', () => {
  manualYaw = manualPitch = 0;
  orientation.recenter();
  toast('已回到眼前这片风景');
  setControls(true);
});
$('view-settings').addEventListener('click', () => {
  $('install-hint').hidden = isStandalone();
  $('fullscreen').hidden = !document.fullscreenEnabled || !document.documentElement.requestFullscreen;
  $('fullscreen').innerHTML = `${icon('full')} ${document.fullscreenElement ? '退出全屏' : '全屏显示'}`;
  openPanel('view-dialog');
});
function startEyes() {
  eyesWanted = true;
  eyeResultReceived = faceDetected = false;
  eyeFilter.reset(); eyeMotion.reset();
  eyeAngle = screenAngle();
  void tracker.start();
}
$('eyes').addEventListener('click', () => {
  if (eyesWanted) { eyesWanted = false; tracker.stop(); eyeFilter.reset(); eyeMotion.reset(); }
  else startEyes();
  status();
});
$('eye-center').addEventListener('click', () => { eyeFilter.reset(); eyeMotion.reset(); status(); });
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $<HTMLDialogElement>('view-dialog').close();
  } catch { toast('浏览器暂不支持全屏，可以从主屏幕打开 Portal。'); }
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
  const sensitivity = DEFAULT_FOV * Math.PI / 180 / Math.min(canvas.clientWidth, canvas.clientHeight);
  if (!motionWanted) {
    manualYaw += dx * sensitivity;
    manualPitch = clamp(manualPitch + dy * sensitivity, -1.35, 1.35);
  }
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
    if (motionWanted) return;
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
  eyeFilter.reset(); eyeMotion.reset();
  orientation.stop();
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
  ++session;
  if (motionWanted) void startMotion();
  if (eyesWanted) startEyes();
  setControls(true);
  startAnimation();
});
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); suspend(); $('render-error').hidden = false; });
canvas.addEventListener('webglcontextrestored', () => { $('render-error').hidden = true; if (mode === 'welcome') startAnimation(); });

function draw(now: number) {
  animation = 0;
  if (document.hidden || suspended || !renderer) return;
  const elapsed = (now - lastDraw) / 1000 || 1 / 60;
  const dt = Math.min(elapsed, 0.1);
  lastDraw = now;
  renderFrameSeconds = renderFrameSeconds ? renderFrameSeconds * .95 + elapsed * .05 : elapsed;
  renderFps = 1 / renderFrameSeconds;
  // The same projection is used before/after permission, during stale events and on resume.
  const { size } = panoramaView(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
  const offset = eyeFilter.update(dt, now);
  const base = new Quaternion().setFromEuler(new Euler(manualPitch, -selected.initialYaw + manualYaw, 0, 'YXZ'));
  if (mode === 'immersive') base.multiply(orientation.update(dt, now));
  renderedEyeGain += (eyeGain - renderedEyeGain) * (1 - Math.exp(-dt / .15));
  const eye = offAxisEye(mode === 'immersive' ? eyeMotion.screenOffset(offset, orientation.poseAt(now)) : { x: 0, y: 0 }, renderedEyeGain);
  renderer.draw(size, base, eye);
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
