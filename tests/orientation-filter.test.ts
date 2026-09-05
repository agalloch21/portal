import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { OrientationFilter } from '../src/orientation-filter';
import { panoramaView } from '../src/view';
import { deviceQuaternion, rayForPixel } from '../src/geometry';

const yaw = (degrees: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180);
function ready(initial = yaw(0)) {
  const filter = new OrientationFilter();
  filter.sample(initial, 0);
  filter.update(1 / 60, 240);
  return filter;
}
function settle(filter: OrientationFilter, from: number, duration = 1000, hz = 60) {
  for (let t = from; t < from + duration; t += 1000 / hz) filter.update(1 / hz, t);
  return filter.rotation;
}

describe('stable device orientation', () => {
  it('opening flat then lifting upright preserves the gravity horizon', () => {
    const filter = ready(deviceQuaternion(173, 0, 0, 0));
    settle(filter, 250);
    for (let beta = 1; beta <= 90; beta++) {
      filter.sample(deviceQuaternion(173, beta, 0, 0), 1300 + beta * 16);
      filter.update(.016, 1300 + beta * 16);
    }
    const direction = rayForPixel(0, 0, { x: 0, y: 0, z: 1 }, settle(filter, 2800));
    expect(direction.y).toBeCloseTo(0, 3);
    expect(direction.z).toBeLessThan(-.99);
  });
  it('recenter changes yaw but cannot erase pitch or roll', () => {
    const pose = deviceQuaternion(120, 65, -15, 0);
    const filter = ready(pose);
    settle(filter, 250);
    filter.recenter();
    const gravity = new Vector3(0, 1, 0).applyQuaternion(pose.clone().invert());
    const after = new Vector3(0, 1, 0).applyQuaternion(filter.rotation.invert());
    expect(after.distanceTo(gravity)).toBeLessThan(.0001);
  });
  it('portrait and landscape use the same physical viewing direction', () => {
    const p = deviceQuaternion(20, 70, 0, 0);
    const l = deviceQuaternion(20, 70, 0, 90);
    const f = new Vector3(0, 0, -1);
    expect(f.clone().applyQuaternion(p).distanceTo(f.clone().applyQuaternion(l))).toBeLessThan(.0001);
  });
  it('absorbs initial heading corrections during alignment', () => {
    const filter = new OrientationFilter();
    filter.sample(yaw(0), 0);
    filter.sample(yaw(120), 80);
    filter.sample(yaw(126), 150);
    expect(filter.update(1 / 60, 240).angleTo(new Quaternion())).toBeCloseTo(0);
    expect(filter.ready).toBe(true);
  });
  it('does not integrate small stationary noise into drifting motion', () => {
    const filter = ready();
    for (let i = 0; i < 1200; i++) {
      const now = 260 + i * 16;
      filter.sample(yaw(i % 2 ? .07 : -.07), now);
      filter.update(.016, now);
    }
    expect(filter.rotation.angleTo(new Quaternion())).toBeCloseTo(0);
  });
  it('drops an isolated large orientation spike', () => {
    const filter = ready();
    filter.sample(yaw(0), 250);
    filter.sample(yaw(110), 266);
    filter.update(.016, 266);
    filter.sample(yaw(.01), 282);
    expect(settle(filter, 282).angleTo(new Quaternion())).toBeCloseTo(0);
  });
  it('rebases a sustained browser heading reset without moving the scene', () => {
    const filter = ready();
    filter.sample(yaw(0), 250);
    for (let t = 266; t < 330; t += 16) { filter.sample(yaw(100), t); filter.update(.016, t); }
    expect(filter.rotation.angleTo(new Quaternion())).toBeCloseTo(0);
    filter.sample(yaw(105), 350);
    expect(settle(filter, 350).angleTo(yaw(5))).toBeLessThan(.002);
  });
  it('follows deliberate turns without applying the reference rotation twice', () => {
    const filter = ready(yaw(120));
    for (let i = 0; i <= 90; i++) {
      filter.sample(yaw(120 + i), 250 + i * 16);
      filter.update(.016, 250 + i * 16);
    }
    expect(settle(filter, 1700).angleTo(yaw(90))).toBeLessThan(.002);
  });
  it('crosses 359° to 0° through the shortest rotation', () => {
    const filter = ready(yaw(359));
    filter.sample(yaw(1), 260);
    expect(settle(filter, 260).angleTo(yaw(2))).toBeLessThan(.002);
  });
  it('holds framing over a stopped / resumed sensor stream', () => {
    const filter = ready();
    filter.sample(yaw(20), 260);
    const before = settle(filter, 260);
    filter.begin();
    filter.sample(yaw(160), 2000);
    expect(filter.update(.016, 2300).angleTo(before)).toBeCloseTo(0);
    filter.sample(yaw(165), 2316);
    expect(settle(filter, 2316).angleTo(yaw(25))).toBeLessThan(.002);
  });
  it('freezes on missing data and does not jump on reacquisition', () => {
    const filter = ready();
    filter.sample(yaw(10), 260);
    const before = settle(filter, 260);
    filter.sample(yaw(-90), 2500);
    expect(filter.update(.016, 2500).angleTo(before)).toBeCloseTo(0);
  });
  it('rejects malformed and out-of-order samples', () => {
    const filter = ready();
    filter.sample(new Quaternion(NaN, 0, 0, 1), 250);
    filter.sample(yaw(60), -10);
    expect(settle(filter, 260).angleTo(new Quaternion())).toBeCloseTo(0);
  });
  it('gives comparable smoothing at 30 and 60 Hz', () => {
    const a = ready(), b = ready();
    a.sample(yaw(4), 260); b.sample(yaw(4), 260);
    const qa = settle(a, 260, 200, 30), qb = settle(b, 260, 200, 60);
    expect(qa.angleTo(qb)).toBeLessThan(.004);
  });
});

describe('panorama field of view', () => {
  it('defaults to a wide 60° horizontal view on a portrait phone', () => {
    const { size, eye } = panoramaView(390, 844);
    const left = rayForPixel(-size.width / 2, 0, eye), right = rayForPixel(size.width / 2, 0, eye);
    expect(left.angleTo(right) * 180 / Math.PI).toBeCloseTo(60);
  });
  it('preserves the short-axis scale across portrait and landscape', () => {
    const p = panoramaView(390, 844), l = panoramaView(844, 390);
    expect(p.eye.z).toBe(l.eye.z);
    expect(p.size.width).toBe(l.size.height);
  });
  it('keeps the central ray fixed when the browser address bar changes viewport height', () => {
    const a = panoramaView(390, 844), b = panoramaView(390, 700);
    expect(a.eye).toEqual(b.eye);
    expect(rayForPixel(0, 0, a.eye).toArray()).toEqual(rayForPixel(0, 0, b.eye).toArray());
  });
});
