import { clamp, type Eye } from './geometry';

/** Calibrated angular eye displacement. Focal distance is deliberately fixed. */
export class EyeFilter {
  private samples: { eye: Eye; time: number }[] = [];
  private baseline: Eye | null = null;
  private target = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private predicting = false;
  private motionSamples = 0;
  private current = { x: 0, y: 0 };
  private renderVelocity = { x: 0, y: 0 };
  private lastSeen = -Infinity;
  private lastInput = -Infinity;
  get calibrated() { return this.baseline !== null; }
  visible(now: number) { return this.calibrated && now - this.lastSeen < 650; }

  reset() {
    this.velocity = { x: 0, y: 0 };
    this.renderVelocity = { x: 0, y: 0 };
    this.predicting = false;
    this.motionSamples = 0;
    this.samples = [];
    this.baseline = null;
    this.target = { x: 0, y: 0 };
    this.lastSeen = this.lastInput = -Infinity;
  }

  sample(eye: Eye | null, now: number, receivedAt = now) {
    if (!eye) {
      this.samples = [];
      this.target = { ...this.current };
      this.velocity = { x: 0, y: 0 };
      this.renderVelocity = { x: 0, y: 0 };
      this.predicting = false;
      this.motionSamples = 0;
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
    const x = 3 * (eye.x - this.baseline.x) / eye.z;
    const y = 3 * (eye.y - this.baseline.y) / eye.z;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.predicting && gap > 0 && gap < 200 && receivedAt - this.lastSeen < 200) {
      const vx = (x - this.target.x) / (gap / 1000);
      const vy = (y - this.target.y) / (gap / 1000);
      const reversed = vx * this.velocity.x + vy * this.velocity.y < 0;
      this.motionSamples = Math.hypot(vx, vy) > .15 ? reversed ? 1 : this.motionSamples + 1 : 0;
      const blend = reversed || Math.hypot(vx, vy) < .04 ? 1 : .5;
      this.velocity.x += (vx - this.velocity.x) * blend;
      this.velocity.y += (vy - this.velocity.y) * blend;
    } else this.velocity = { x: 0, y: 0 };
    this.predicting = true;
    this.lastSeen = receivedAt;
    this.target = { x, y };
  }

  update(dt: number, now: number) {
    // Freeze on silence; prediction must never keep moving after tracking loss.
    if (this.baseline && now - this.lastSeen > 200) {
      this.target = { ...this.current };
      this.velocity = { x: 0, y: 0 };
      this.renderVelocity = { x: 0, y: 0 };
      this.predicting = false;
      this.motionSamples = 0;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    // A short bounded lead compensates for capture/inference latency between results.
    const horizon = this.predicting && this.motionSamples >= 2 ? clamp((now - this.lastInput) / 1000, 0, .05) : 0;
    const lead = Math.min(horizon, .1 / Math.max(speed, .0001));
    const target = { x: this.target.x + this.velocity.x * lead, y: this.target.y + this.velocity.y * lead };
    // A critically damped spring carries velocity across observation updates.
    // Its exact solution is stable across refresh rates and avoids per-result
    // velocity jumps caused by reweighting a first-order interpolation.
    const step = clamp(dt, 0, .1);
    const omega = 75;
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
