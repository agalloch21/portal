import { Quaternion, Vector3 } from 'three';
import type { Eye } from './geometry';

/** Separate head displacement from the front camera rotating with the phone. */
export class EyeMotionFrame {
  private reference: Quaternion | null = null;
  private usingPose: boolean | null = null;

  reset() { this.reference = null; this.usingPose = null; }

  observation(eye: Eye, pose: Quaternion | null) {
    const changed = this.usingPose !== null && this.usingPose !== Boolean(pose);
    if (changed) this.reference = null;
    this.usingPose = Boolean(pose);
    if (!pose) return { eye, changed };
    this.reference ??= pose.clone();
    const point = new Vector3(eye.x, eye.y, eye.z)
      .applyQuaternion(pose).applyQuaternion(this.reference.clone().invert());
    return { eye: { x: point.x, y: point.y, z: point.z }, changed };
  }

  screenOffset(offset: { x: number; y: number }, pose: Quaternion | null) {
    if (!this.reference || !pose) return offset;
    const point = new Vector3(offset.x, offset.y, 0)
      .applyQuaternion(this.reference).applyQuaternion(pose.clone().invert());
    return { x: point.x, y: point.y };
  }
}
