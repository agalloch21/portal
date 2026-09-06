import { Matrix4 } from 'three';

export const DEFAULT_FOV = 60;
export const VIEW_DISTANCE = 1 / (2 * Math.tan(DEFAULT_FOV * Math.PI / 360));
/** Fixed short-axis projection; eye tracking cannot change focal distance. */
export function panoramaView(width: number, height: number) {
  const size = { width: width / Math.min(width, height), height: height / Math.min(width, height) };
  return { size, eye: { x: 0, y: 0, z: VIEW_DISTANCE } };
}

export function offAxisEye(offset: { x: number; y: number }, gain = 1) {
  return { x: offset.x * gain * VIEW_DISTANCE, y: offset.y * gain * VIEW_DISTANCE, z: VIEW_DISTANCE };
}

export function offAxisProjection(size: { width: number; height: number }, eye: { x: number; y: number; z: number }, near: number, far: number) {
  const scale = near / eye.z;
  return new Matrix4().makePerspective(
    (-size.width / 2 - eye.x) * scale, (size.width / 2 - eye.x) * scale,
    (size.height / 2 - eye.y) * scale, (-size.height / 2 - eye.y) * scale, near, far);
}

export function parseEyeGain(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 3 ? value : 1;
}
