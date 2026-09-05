import { deviceQuaternion } from './geometry';
import { OrientationFilter } from './orientation-filter';

export function screenAngle() {
  return screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
}

export class Orientation {
  private filter = new OrientationFilter();
  private listening = false;
  private lastEvent = -Infinity;
  private generation = 0;
  get available() { return this.listening && this.filter.ready && performance.now() - this.lastEvent < 2000; }
  get aligning() { return this.listening && !this.filter.ready && this.lastEvent > -Infinity; }
  get rotation() { return this.filter.rotation; }

  async start(): Promise<boolean> {
    if (this.listening) return true;
    const generation = ++this.generation;
    const api = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> };
    if (!api || !window.isSecureContext) return false;
    try {
      // Relative motion is enough; no magnetic-north / compass permission needed.
      if (api.requestPermission && await api.requestPermission(false) !== 'granted') return false;
      if (generation !== this.generation) return false;
      this.filter.begin();
      this.lastEvent = -Infinity;
      window.addEventListener('deviceorientation', this.onEvent);
      this.listening = true;
      return true;
    } catch { return false; }
  }

  private onEvent = (event: DeviceOrientationEvent) => {
    if (event.alpha == null || event.beta == null || event.gamma == null || ![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
    const angle = screenAngle();
    const pose = deviceQuaternion(event.alpha, event.beta, event.gamma, angle);
    const now = performance.now();
    this.filter.sample(pose, now);
    this.lastEvent = now;
  };

  update(dt: number, now: number) { return this.filter.update(dt, now); }
  recenter() { this.filter.recenter(); }
  stop() {
    ++this.generation;
    window.removeEventListener('deviceorientation', this.onEvent);
    this.listening = false;
    this.lastEvent = -Infinity;
    // Hold the rendered view and cancel residual smoothing.
    this.filter.begin();
  }
}
