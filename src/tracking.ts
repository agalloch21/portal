import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { faceObservation } from './face-observation';
import type { FaceObservation } from './geometry';

type State = 'off' | 'loading' | 'ready' | 'denied' | 'error';

export class EyeTracker {
  readonly video = document.createElement('video');
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private detector: FaceLandmarker | null = null;
  private generation = 0;
  private timer = 0;
  private busy = false;
  private lastVideoTime = -1;
  private frameTimeout = 0;
  private interval = 1000 / 30;
  private videoCallback = 0;
  private lastFrameStart = -Infinity;
  private started = false;
  private lastResult = 0;
  private resultInterval = 0;
  private processingMs = 0;
  get metrics() {
    return { mode: this.worker ? 'Worker' : this.detector ? 'Main thread' : '-',
      hz: this.lastResult && performance.now() - this.lastResult < 1000 && this.resultInterval ? 1000 / this.resultInterval : 0,
      latency: this.processingMs };
  }
  private deliver(face: FaceObservation | null, timestamp: number) {
    const now = performance.now();
    if (this.lastResult) this.resultInterval = this.resultInterval ? this.resultInterval * .8 + (now - this.lastResult) * .2 : now - this.lastResult;
    this.processingMs = this.processingMs ? this.processingMs * .8 + (now - timestamp) * .2 : now - timestamp;
    this.lastResult = now;
    this.onFace(face, timestamp);
  }
  state: State = 'off';
  onState: (state: State) => void = () => {};
  onFace: (face: FaceObservation | null, timestamp: number) => void = () => {};
  get active() { return this.started; }

  constructor() {
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
    this.video.className = 'tracking-video';
    this.video.setAttribute('aria-hidden', 'true');
    document.body.append(this.video);
  }

  private setState(state: State) { this.state = state; this.onState(state); }

  async start() {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;
    this.setState('loading');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.started = false;
      this.setState('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.generation && this.started) this.fail('error');
      }));
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      try { await this.startWorker(generation); }
      catch (error) {
        console.warn('Portal worker initialization failed:', error);
        if (generation !== this.generation) return;
        this.worker?.terminate();
        this.worker = null;
        await this.startMainThread(generation);
      }
      if (generation !== this.generation) return;
      this.setState('ready');
      this.schedule();
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }

  private async startWorker(generation: number) {
    if (!window.Worker || !window.createImageBitmap) throw new Error('Worker unavailable');
    // MediaPipe's WASM loader calls importScripts(), requiring a classic worker.
    const worker = import.meta.env.DEV
      ? new Worker(`${import.meta.env.BASE_URL}__portal_face_worker.js`)
      : new Worker(new URL('./face-worker.ts', import.meta.url));
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Worker init timed out')), 12000);
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message || 'Worker failed')); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
        if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
      };
      worker.postMessage({ type: 'init', wasmUrl: new URL(`${import.meta.env.BASE_URL}wasm`, location.href).href, modelUrl: new URL(`${import.meta.env.BASE_URL}models/face_landmarker.task`, location.href).href });
    });
    if (generation !== this.generation) { worker.terminate(); return; }
    worker.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      clearTimeout(this.frameTimeout);
      this.busy = false;
      if (data.type === 'result') { this.deliver(data.face, data.timestamp); this.schedule(); }
      else if (data.type === 'error') void this.recoverOnMainThread(generation);
    };
    worker.onerror = () => { if (generation === this.generation) void this.recoverOnMainThread(generation); };
  }

  private async startMainThread(generation: number) {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    if (generation !== this.generation) return;
    const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    if (generation !== this.generation) return;
    const detector = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    if (generation !== this.generation) { detector.close(); return; }
    this.detector = detector;
    this.interval = 1000 / 15;
  }

  private async recoverOnMainThread(generation: number) {
    if (!this.worker) return;
    this.cancelScheduledFrame();
    clearTimeout(this.frameTimeout);
    this.worker.terminate();
    this.worker = null;
    this.busy = false;
    this.setState('loading');
    try {
      await this.startMainThread(generation);
      if (generation !== this.generation) return;
      this.setState('ready');
      this.schedule();
    } catch { if (generation === this.generation) this.fail('error'); }
  }

  private cancelScheduledFrame() {
    clearTimeout(this.timer);
    if (this.videoCallback) this.video.cancelVideoFrameCallback(this.videoCallback);
    this.videoCallback = 0;
  }

  private schedule() {
    this.cancelScheduledFrame();
    if (!this.started || this.busy) return;
    // A frame may already have arrived while inference was busy. Consume the latest
    // decoded frame instead of always waiting for one more camera frame callback.
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      const wait = Math.max(0, this.interval - 2 - (performance.now() - this.lastFrameStart));
      this.timer = window.setTimeout(() => void this.frame(), wait);
      return;
    }
    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.videoCallback = this.video.requestVideoFrameCallback(() => {
        this.videoCallback = 0;
        if (performance.now() - this.lastFrameStart < this.interval - 2) this.schedule();
        else void this.frame();
      });
    } else {
      const delay = Math.max(8, this.interval - (performance.now() - this.lastFrameStart));
      this.timer = window.setTimeout(() => void this.frame(), delay);
    }
  }

  private async frame() {
    const generation = this.generation;
    const video = this.video;
    if (!this.started || document.hidden) return;
    if (this.busy || video.readyState < 2 || video.currentTime === this.lastVideoTime) { this.schedule(); return; }
    this.lastVideoTime = video.currentTime;
    this.busy = true;
    const timestamp = performance.now();
    this.lastFrameStart = timestamp;
    try {
      if (this.worker) {
        const bitmap = await createImageBitmap(video);
        if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
        this.worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
        this.frameTimeout = window.setTimeout(() => void this.recoverOnMainThread(generation), 3000);
      } else if (this.detector) {
        const result = this.detector.detectForVideo(video, timestamp);
        this.deliver(faceObservation(result, video.videoWidth, video.videoHeight), timestamp);
        this.busy = false;
      }
    } catch {
      this.busy = false;
      if (this.worker) { void this.recoverOnMainThread(generation); return; }
      this.fail('error');
      return;
    }
    if (generation === this.generation && !this.busy) this.schedule();
  }

  slowDown() { this.interval = Math.max(this.interval, 1000 / 15); }

  private fail(state: 'denied' | 'error') { this.stop(); this.setState(state); }
  stop() {
    this.started = false;
    ++this.generation;
    this.cancelScheduledFrame();
    clearTimeout(this.frameTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.interval = 1000 / 30;
    this.lastFrameStart = -Infinity;
    this.lastResult = this.resultInterval = this.processingMs = 0;
    this.setState('off');
    this.onFace(null, performance.now());
  }
}
