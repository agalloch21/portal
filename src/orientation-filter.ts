import { Quaternion, Vector3 } from 'three';
import { relativeRotation } from './geometry';

const RAD = Math.PI / 180;
const up = new Vector3(0, 1, 0);
function heading(q: Quaternion) {
  const forward = new Vector3(0, 0, -1).applyQuaternion(q);
  if (Math.hypot(forward.x, forward.z) > .01) return Math.atan2(-forward.x, -forward.z);
  const right = new Vector3(1, 0, 0).applyQuaternion(q);
  return Math.atan2(-right.z, right.x);
}

/** Pose filtering independent of event rate, with a yaw-only reference and gravity-preserving pitch/roll. */
export class OrientationFilter {
  private anchor: Quaternion | null = null;
  private input: Quaternion | null = null;
  private target = new Quaternion();
  private filtered = new Quaternion();
  private lastSample = -Infinity;
  private started = -Infinity;
  private candidate: { pose: Quaternion; count: number; since: number } | null = null;
  private aligned = false;

  get ready() { return this.aligned; }
  get rotation() { return this.filtered.clone(); }

  /** Hold the view while a fresh reference is acquired. */
  begin() {
    this.anchor = this.input = null;
    this.candidate = null;
    this.aligned = false;
    this.lastSample = this.started = -Infinity;
    this.target.copy(this.filtered);
  }

  sample(pose: Quaternion, now: number) {
    if (!pose.toArray().every(Number.isFinite) || !Number.isFinite(now) || pose.lengthSq() < .5) return;
    if (now <= this.lastSample) return;
    const q = pose.clone().normalize();
    const gap = now - this.lastSample;
    this.lastSample = now;
    if (!this.input) {
      this.started = now;
      this.align(q);
      return;
    }
    if (!this.aligned) {
      // Absorb initial heading correction instead of showing an opening spin.
      this.align(q);
      return;
    }
    if (gap > 750) { this.align(q); return; }
    const change = this.input.angleTo(q);
    if (change > Math.max(30 * RAD, gap / 1000 * 720 * RAD)) {
      // Drop isolated glitches; rebase a sustained heading reset without jumping.
      if (this.candidate && this.candidate.pose.angleTo(q) < 8 * RAD && now - this.candidate.since < 250) {
        this.candidate.count++;
        if (this.candidate.count >= 3) this.align(q);
      } else this.candidate = { pose: q, count: 1, since: now };
      return;
    }
    this.candidate = null;
    if (change < .15 * RAD) return;
    this.input.copy(q);
    this.target.copy(relativeRotation(this.anchor!, q));
  }

  /** Preserve horizontal heading while restoring gravity-based pitch and roll. */
  align(pose: Quaternion) {
    this.input = pose.clone();
    this.anchor = new Quaternion().setFromAxisAngle(up, heading(pose) - heading(this.filtered));
    this.target.copy(relativeRotation(this.anchor, pose));
    this.candidate = null;
  }

  update(dt: number, now: number) {
    if (!this.aligned && this.input && now - this.started >= 220) this.aligned = true;
    const error = this.filtered.angleTo(this.target);
    const tau = error > 5 * RAD ? .065 : .12;
    this.filtered.slerp(this.target, 1 - Math.exp(-Math.max(0, Math.min(dt, .1)) / tau)).normalize();
    return this.rotation;
  }

  recenter() {
    this.candidate = null;
    this.anchor = this.input ? new Quaternion().setFromAxisAngle(up, heading(this.input)) : null;
    if (this.input) {
      this.target.copy(relativeRotation(this.anchor!, this.input));
      this.filtered.copy(this.target);
    } else {
      this.filtered.identity();
      this.target.identity();
    }
  }
}
