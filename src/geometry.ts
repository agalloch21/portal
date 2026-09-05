import { Euler, Quaternion, Vector3 } from 'three';

export interface Eye { x: number; y: number; z: number }
export interface Calibration { shortEdgeMm: number; distanceMm: number; distanceScale: number }
export const defaults: Calibration = { shortEdgeMm: 64, distanceMm: 350, distanceScale: 1 };
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function screenSize(width: number, height: number, shortEdge: number) {
  const scale = shortEdge / Math.min(width, height);
  return { width: width * scale, height: height * scale };
}

export function rayForPixel(x: number, y: number, eye: Eye, rotation = new Quaternion()) {
  return new Vector3(x - eye.x, y - eye.y, -eye.z).normalize().applyQuaternion(rotation);
}

/** Device coordinates -> screen-aligned camera, looking along -Z. */
export function deviceQuaternion(alpha: number, beta: number, gamma: number, screenAngle: number) {
  const rad = Math.PI / 180;
  return new Quaternion().setFromEuler(new Euler(beta * rad, alpha * rad, -gamma * rad, 'YXZ'))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -screenAngle * rad));
}

export function relativeRotation(reference: Quaternion, current: Quaternion) {
  return reference.clone().invert().multiply(current);
}

export interface FaceObservation {
  centerX: number;
  centerY: number;
  eyePixels: number;
  foreshortening: number;
  width: number;
  height: number;
}

/** Raw, unmirrored front-camera pixels. All returned distances are millimetres. */
export function estimateEye(face: FaceObservation, calibration: Calibration, viewport: { width: number; height: number }, angle: number): Eye | null {
  if (face.eyePixels < 8 || !Number.isFinite(face.eyePixels)) return null;
  const focal = face.width / (2 * Math.tan(Math.PI / 6));
  const rawZ = focal * 63 * clamp(face.foreshortening, 0.55, 1) / face.eyePixels;
  const z = clamp(rawZ * calibration.distanceScale, 150, 1000);
  // A front-facing camera's image X points opposite to the physical screen X.
  let x = -(face.centerX - face.width / 2) * z / focal;
  let y = -(face.centerY - face.height / 2) * z / focal;
  // Browsers generally deliver upright frames. Rotate only a portrait/landscape mismatch.
  if ((face.width > face.height) !== (viewport.width > viewport.height)) {
    const r = -angle * Math.PI / 180;
    [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  }
  const size = screenSize(viewport.width, viewport.height, calibration.shortEdgeMm);
  const cameraOffset = Math.max(size.width, size.height) / 2 - 6;
  const r = angle * Math.PI / 180;
  x += Math.sin(r) * cameraOffset;
  y += Math.cos(r) * cameraOffset;
  return { x: clamp(x, -250, 250), y: clamp(y, -250, 250), z };
}

export function smoothEye(current: Eye, target: Eye, dt: number): Eye {
  // Exponential smoothing is independent of display refresh rate; limit one-frame jumps.
  const a = 1 - Math.exp(-Math.min(dt, 0.1) / 0.065);
  return {
    x: current.x + clamp(target.x - current.x, -120, 120) * a,
    y: current.y + clamp(target.y - current.y, -120, 120) * a,
    z: current.z + clamp(target.z - current.z, -180, 180) * a,
  };
}

export function parseCalibration(value: unknown): Calibration {
  const v = value as Partial<Calibration> | null;
  const valid = (n: unknown, lo: number, hi: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
  return {
    shortEdgeMm: valid(v?.shortEdgeMm, 45, 350, defaults.shortEdgeMm),
    distanceMm: valid(v?.distanceMm, 150, 1000, defaults.distanceMm),
    distanceScale: valid(v?.distanceScale, 0.2, 5, defaults.distanceScale),
  };
}
