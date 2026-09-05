import { Quaternion } from 'three';
import { deviceQuaternion, relativeRotation } from './geometry';

export function screenAngle() {
  return screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
}

export class Orientation {
  private current = new Quaternion();
  private reference: Quaternion | null = null;
  private listening = false;
  private lastEvent = 0;
  private angle = screenAngle();
  private generation = 0;
  get available() { return this.listening && performance.now() - this.lastEvent < 2000; }
  get rotation() { return this.reference ? relativeRotation(this.reference, this.current) : new Quaternion(); }

  // Call directly in a user gesture, before awaiting camera/model operations.
  async start(): Promise<boolean> {
    if (this.listening) return true;
    const generation = ++this.generation;
    const api = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (!api || !window.isSecureContext) return false;
    try {
      if (api.requestPermission && await api.requestPermission() !== 'granted') return false;
      if (generation !== this.generation) return false;
      window.addEventListener('deviceorientation', this.onEvent);
      this.listening = true;
      return true;
    } catch { return false; }
  }

  private onEvent = (event: DeviceOrientationEvent) => {
    if (event.alpha == null || event.beta == null || event.gamma == null) return;
    const angle = screenAngle();
    this.current.copy(deviceQuaternion(event.alpha, event.beta, event.gamma, angle));
    if (!this.reference || this.angle !== angle) {
      // Rebase after a display orientation change so the horizon cannot suddenly flip.
      this.reference = this.current.clone();
      this.angle = angle;
    }
    this.lastEvent = performance.now();
  };

  recenter() { this.reference = this.current.clone(); }
  stop() {
    ++this.generation;
    window.removeEventListener('deviceorientation', this.onEvent);
    this.listening = false;
    this.lastEvent = 0;
    this.reference = null;
  }
}
