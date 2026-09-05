import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { defaults, deviceQuaternion, estimateEye, parseCalibration, rayForPixel, relativeRotation, screenSize, smoothEye, type FaceObservation } from '../src/geometry';

describe('physical window rays', () => {
  const eye = { x: 0, y: 0, z: 350 };
  it('looks forward from the centre and has symmetric edge rays', () => {
    expect(rayForPixel(0, 0, eye).toArray()).toEqual([0, 0, -1]);
    const left = rayForPixel(-32, 0, eye), right = rayForPixel(32, 0, eye);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.z).toBeCloseTo(right.z);
  });
  it('looks left through a fixed pixel when the eye moves right', () => {
    expect(rayForPixel(0, 0, { ...eye, x: 40 }).x).toBeLessThan(0);
  });
  it('sees a wider angular window when the eye approaches', () => {
    expect(rayForPixel(32, 0, { ...eye, z: 200 }).x).toBeGreaterThan(rayForPixel(32, 0, eye).x);
  });
  it('rotates each ray once into world space', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const ray = rayForPixel(0, 0, eye, q);
    expect(ray.x).toBeCloseTo(-1);
    expect(ray.z).toBeCloseTo(0);
  });
  it('keeps physical screen size under portrait/landscape exchange', () => {
    const p = screenSize(390, 844, 64), l = screenSize(844, 390, 64);
    expect(p.width).toBe(64);
    expect(l.height).toBe(64);
    expect(p.height).toBe(l.width);
  });
});

describe('sensor reference', () => {
  it('recentres arbitrary orientations to identity', () => {
    const q = deviceQuaternion(126, 64, -17, 0);
    expect(relativeRotation(q, q).angleTo(new Quaternion())).toBeCloseTo(0);
  });
  it('keeps quaternion normalised for both landscape orientations', () => {
    for (const angle of [0, 90, 180, 270]) expect(deviceQuaternion(20, 80, 15, angle).length()).toBeCloseTo(1);
  });
  it('cancels a screen roll with the matching screen orientation', () => {
    const portrait = deviceQuaternion(0, 90, 0, 0);
    const landscape = deviceQuaternion(90, 0, -90, 90);
    expect(relativeRotation(portrait, landscape).angleTo(new Quaternion())).toBeCloseTo(0);
  });
});

describe('eye estimates and calibration', () => {
  const observation: FaceObservation = { width: 640, height: 480, centerX: 320, centerY: 240, eyePixels: 100, foreshortening: 1 };
  const viewport = { width: 390, height: 844 };
  it('uses face scale rather than a model-relative landmark Z', () => {
    const first = estimateEye(observation, defaults, viewport, 0)!;
    const farther = estimateEye({ ...observation, eyePixels: 50 }, defaults, viewport, 0)!;
    expect(first.z).toBeCloseTo(349.1814, 2);
    expect(farther.z).toBeCloseTo(first.z * 2);
  });
  it('corrects the unmirrored front camera X and top camera offset', () => {
    const center = estimateEye(observation, defaults, viewport, 0)!;
    const leftInImage = estimateEye({ ...observation, centerX: 280 }, defaults, viewport, 0)!;
    expect(center.x).toBe(0);
    expect(center.y).toBeGreaterThan(0);
    expect(leftInImage.x).toBeGreaterThan(center.x);
  });
  it('accounts for a turned head instead of treating it as farther away', () => {
    const front = estimateEye(observation, defaults, viewport, 0)!;
    const turned = estimateEye({ ...observation, eyePixels: 70, foreshortening: .7 }, defaults, viewport, 0)!;
    expect(turned.z).toBeCloseTo(front.z);
  });
  it('uses calibration scale and rejects tiny detections', () => {
    expect(estimateEye({ ...observation, eyePixels: 2 }, defaults, viewport, 0)).toBeNull();
    expect(estimateEye(observation, { ...defaults, distanceScale: 1.2 }, viewport, 0)!.z).toBeCloseTo(419.0177, 2);
  });
  it('recovers safe defaults from malformed persisted settings', () => {
    expect(parseCalibration(null)).toEqual(defaults);
    expect(parseCalibration({ shortEdgeMm: -64, distanceMm: Infinity, distanceScale: '2' })).toEqual(defaults);
  });
  it('smooths using elapsed time rather than a fixed frame weight', () => {
    const current = { x: 0, y: 0, z: 350 }, target = { x: 40, y: 10, z: 390 };
    const one = smoothEye(current, target, 1 / 30);
    const two = smoothEye(smoothEye(current, target, 1 / 60), target, 1 / 60);
    expect(two.x).toBeCloseTo(one.x);
    expect(two.z).toBeCloseTo(one.z);
  });
});
