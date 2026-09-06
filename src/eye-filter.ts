import { clamp, type Eye } from './geometry';

/** Calibrated angular eye displacement. Focal distance is deliberately fixed. */
export class EyeFilter {
  private samples: { eye: Eye; time: number }[] = [];
  private baseline: Eye | null = null;
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private renderVelocity = { x: 0, y: 0 };
  private lastSeen = -Infinity;
  private lastInput = -Infinity;
  get calibrated() { return this.baseline !== null; }
  visible(now: number) { return this.calibrated && now - this.lastSeen < 650; }

  reset() {
    this.renderVelocity = { x: 0, y: 0 };
    this.samples = [];
    this.baseline = null;
    this.target = { x: 0, y: 0 };
    this.lastSeen = this.lastInput = -Infinity;
  }

  sample(eye: Eye | null, now: number, receivedAt = now) {
    if (!eye) {
      this.samples = [];
      this.target = { ...this.current };
      this.renderVelocity = { x: 0, y: 0 };
      return;
    }
    if (![eye.x, eye.y, eye.z, now, receivedAt].every(Number.isFinite) || eye.z < 150 || eye.z > 1000 || now <= this.lastInput) return;
    const gap = now - this.lastInput;
    this.lastInput = now;
    if (!this.baseline) {
      if (gap > 350) this.samples = [];
      this.samples.push({ eye: { ...eye }, time: now });
      if (this.samples.length > 10) this.samples.shift();
      if (this.samples.length < 10 || now - this.samples[0].time < 280) return;
      const median = (key: keyof Eye) => this.samples.map(s => s.eye[key]).sort((a, b) => a - b)[5];
      const center = { x: median('x'), y: median('y'), z: median('z') };
      if (this.samples.some(s => Math.hypot(s.eye.x - center.x, s.eye.y - center.y) > 15 || Math.abs(s.eye.z - center.z) > 35)) return;
      this.baseline = center;
      this.samples = [];
    }
    // Every valid observation contributes, including large off-center movements.
    // Gain changes lateral response, never projection focal distance.
    const x = (eye.x - this.baseline.x) / eye.z;
    const y = (eye.y - this.baseline.y) / eye.z;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.lastSeen = receivedAt;
    this.target = { x, y };
  }

  update(dt: number, now: number) {
    // Freeze the displayed position when observations stop.
    if (this.baseline && now - this.lastSeen > 200) {
      this.target = { ...this.current };
      this.renderVelocity = { x: 0, y: 0 };
    }
    const target = this.target;
    // A critically damped spring carries velocity across observation updates.
    // Its exact solution is stable across refresh rates and avoids per-result
    // velocity jumps caused by reweighting a first-order interpolation.
    const step = clamp(dt, 0, .1);
    // Favor quiet motion over minimum latency; do not extrapolate noisy observations.
    // A sustained step reaches 90% in about 195 ms, 98% in about 292 ms.
    const omega = 20;
    const decay = Math.exp(-omega * step);
    for (const axis of ['x', 'y'] as const) {
      const displacement = this.current[axis] - target[axis];
      const j = this.renderVelocity[axis] + omega * displacement;
      this.current[axis] = target[axis] + (displacement + j * step) * decay;
      this.renderVelocity[axis] = (this.renderVelocity[axis] - omega * j * step) * decay;
    }
    return { ...this.current };
  }
}
