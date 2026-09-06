import { Quaternion } from 'three';
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
  private poses: { time: number; rotation: Quaternion }[] = [];
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
    this.poses.push({ time: now, rotation: pose });
    while (this.poses.length > 1 && this.poses[0].time < now - 2000) this.poses.shift();
    this.filter.sample(pose, now);
    this.lastEvent = now;
  };

  /** Raw capture-time attitude: the smoothed display pose would add false head motion. */
  poseAt(time: number): Quaternion | null {
    if (!this.available || !this.poses.length) return null;
    const first = this.poses[0];
    if (time < first.time - 100) return null;
    for (let i = 1; i < this.poses.length; i++) {
      const a = this.poses[i - 1], b = this.poses[i];
      if (time <= b.time) return a.rotation.clone().slerp(b.rotation, Math.max(0, (time - a.time) / (b.time - a.time)));
    }
    const last = this.poses[this.poses.length - 1];
    return time - last.time <= 200 ? last.rotation.clone() : null;
  }

  update(dt: number, now: number) { return this.filter.update(dt, now); }
  recenter() { this.filter.recenter(); }
  stop() {
    ++this.generation;
    window.removeEventListener('deviceorientation', this.onEvent);
    this.listening = false;
    this.lastEvent = -Infinity;
    this.poses = [];
    // Hold the rendered view and cancel residual smoothing.
    this.filter.begin();
  }
}
