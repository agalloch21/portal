import { expect, it } from 'vitest';
import { EyeFilter } from '../src/eye-filter';
import { panoramaView } from '../src/view';
import { defaults, estimateEye, rayForPixel } from '../src/geometry';

function ready() {
  const f = new EyeFilter();
  for (let i = 0; i < 10; i++) f.sample({ x: 5, y: 30, z: 350 }, -360 + i * 40);
  return f;
}
it('calibrates after a stable window without restricting later travel', () => {
  const f = ready();
  expect(f.calibrated).toBe(true);
  expect(f.update(.1, 0)).toEqual({ x: 0, y: 0 });
  f.sample({ x: 40, y: 30, z: 350 }, 70);
  expect(f.update(.07, 70).x).toBeGreaterThan(0);
});
it('smooths every small valid movement and rejects invalid observations', () => {
  const f = ready();
  f.sample({ x: 6, y: 30, z: 350 }, 70);
  const first = f.update(.07, 70).x;
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(1 / 350);
  f.sample({ x: NaN, y: 30, z: 350 }, 140);
  f.sample({ x: 100, y: 30, z: 350 }, 60);
  const next = f.update(.07, 140).x;
  expect(next).toBeGreaterThan(first);
  expect(next).toBeLessThan(1 / 350);
});
it('preserves unit lateral displacement while retaining the fixed projection', () => {
  const f = ready();
  let offset = { x: 0, y: 0 };
  for (let t = 70; t < 2100; t += 70) {
    f.sample({ x: 40, y: 30, z: 350 }, t);
    offset = f.update(.07, t);
  }
  expect(offset.x).toBeCloseTo(.1, 5);
  const { size, eye } = panoramaView(390, 844);
  const angle = rayForPixel(-size.width/2, 0, eye).angleTo(rayForPixel(size.width/2, 0, eye));
  expect(angle * 180 / Math.PI).toBeCloseTo(60);
  const focal = eye.z;
  eye.x = offset.x * eye.z;
  expect(rayForPixel(0, 0, eye).x).toBeLessThan(-.09);
  expect(eye.z).toBe(focal);
});
it('accepts an immediate large movement and continues beyond the old cap in both axes', () => {
  const f = ready();
  f.sample({ x: 180, y: -145, z: 350 }, 70);
  const first = f.update(.07, 70);
  expect(first.x).toBeGreaterThan(.08);
  expect(first.y).toBeLessThan(-.08);
  f.sample({ x: 355, y: -320, z: 350 }, 140);
  const second = f.update(.07, 140);
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.y).toBeLessThan(first.y);
  expect(f.visible(140)).toBe(true);
});
it('keeps off-center camera estimates instead of clipping them to 250 mm', () => {
  const face = { width: 640, height: 480, centerX: 10, centerY: 10, eyePixels: 40, foreshortening: 1 };
  const eye = estimateEye(face, defaults, { width: 390, height: 844 }, 0)!;
  expect(eye.x).toBeGreaterThan(250);
  expect(eye.y).toBeGreaterThan(250);
  const f = ready();
  f.sample(eye, 70);
  expect(f.update(.07, 70).x).toBeGreaterThan(.08);
});
it('freezes the displayed position on loss and accepts distant reacquisition', () => {
  const f = ready();
  f.sample({ x: 180, y: 30, z: 350 }, 70);
  const first = f.update(.1, 70).x;
  f.sample(null, 140);
  expect(f.update(.1, 140).x).toBe(first);
  let result = f.update(.1, 800);
  for (let t = 900; t < 4000; t += 100) result = f.update(.1, t);
  expect(result.x).toBe(first);
  f.sample({ x: -170, y: 30, z: 350 }, 4100);
  expect(f.update(.07, 4100).x).toBeLessThan(first);
  for (let t = 4140; t <= 4500; t += 40) {
    f.sample({ x: -170, y: 30, z: 350 }, t);
    f.update(.04, t);
  }
  expect(f.update(.016, 4500).x).toBeLessThan(-.46);
});
it('explicit recalibration recenters and requires a fresh stable window', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 70);
  const before = f.update(.1, 70).x;
  f.reset();
  expect(f.calibrated).toBe(false);
  f.sample({ x: 180, y: 30, z: 350 }, 140);
  expect(f.calibrated).toBe(false);
  const after = f.update(.016, 140).x;
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
});

it('does not calibrate during continuous large motion', () => {
  const f = new EyeFilter();
  for (let i = 0; i < 30; i++) f.sample({ x: i % 2 ? 100 : 0, y: 0, z: 350 }, i * 40);
  expect(f.calibrated).toBe(false);
});
it('freezes on silent input loss and keeps the same baseline on return', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 40);
  const before = f.update(.016, 40);
  expect(f.update(.016, 400)).toEqual(before);
  expect(f.update(.1, 2000)).toEqual(before);
  f.sample({ x: 75, y: 30, z: 350 }, 2100);
  expect(f.update(.016, 2100).x).toBeGreaterThan(before.x);
});

it('does not mistake inference latency for a missing observation', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 40, 400);
  expect(f.update(.016, 400).x).toBeGreaterThan(0);
});
it('updates between observation frames instead of stepping only on inference', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 40);
  let previous = 0;
  for (let t = 40; t < 100; t += 16) {
    const x = f.update(.016, t).x;
    expect(x).toBeGreaterThan(previous);
    expect(x).toBeLessThan(.1);
    previous = x;
  }
});

it('attenuates alternating camera jitter while preserving a sustained displacement', () => {
  const f = ready();
  const outputs: number[] = [];
  for (let frame = 1; frame <= 240; frame++) {
    const now = frame * 1000 / 60;
    if (frame % 2 === 0) {
      const jitter = frame % 4 === 0 ? 3 : -3;
      f.sample({ x: 40 + jitter, y: 30, z: 350 }, now);
    }
    const x = f.update(1 / 60, now).x;
    if (frame > 60) outputs.push(x);
  }
  const rawPeakToPeak = 6 / 350;
  expect(Math.max(...outputs) - Math.min(...outputs)).toBeLessThan(rawPeakToPeak * .1);
  expect(outputs.reduce((a, b) => a + b, 0) / outputs.length).toBeCloseTo(.1, 3);
});
it('does not extrapolate the observed position and freezes immediately on loss', () => {
  const f = ready();
  for (let t = 40; t <= 160; t += 40) {
    f.sample({ x: 5 + t, y: 30, z: 350 }, t, t + 30);
    f.update(.04, t + 30);
  }
  const before = f.update(.016, 200);
  expect(before.x).toBeLessThan(160 / 350);
  f.sample(null, 210, 210);
  for (let t = 210; t < 900; t += 16) expect(f.update(.016, t)).toEqual(before);
});

it('keeps display velocity continuous when a new eye result changes direction', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 40);
  const start = f.update(.016, 40).x;
  const epsilon = .000001;
  const before = f.update(epsilon, 40.001).x;
  f.sample({ x: -40, y: 30, z: 350 }, 41);
  const after = f.update(epsilon, 41).x;
  const vBefore = (before - start) / epsilon;
  const vAfter = (after - before) / epsilon;
  expect(Math.abs(vAfter - vBefore)).toBeLessThan(.01);
});
it('gives the same fixed-target response at 30, 60 and 120 Hz', () => {
  const results = [30, 60, 120].map(hz => {
    const f = ready();
    f.sample({ x: 40, y: 30, z: 350 }, 40);
    let x = 0;
    for (let i = 0; i < hz / 10; i++) x = f.update(1 / hz, 40 + i * 1000 / hz).x;
    return x;
  });
  expect(results[0]).toBeCloseTo(results[1], 10);
  expect(results[1]).toBeCloseTo(results[2], 10);
});
it('deliberately eases into a fixed target and settles without oscillation', () => {
  const f = ready();
  f.sample({ x: 40, y: 30, z: 350 }, 40);
  let previous = 0;
  for (let i = 1; i <= 10; i++) {
    f.sample({ x: 40, y: 30, z: 350 }, 40 + i * 40);
    const x = f.update(.04, 40 + i * 40).x;
    if (i === 2) expect(x).toBeLessThan(.1 * .6);
    expect(x).toBeGreaterThan(previous);
    expect(x).toBeLessThan(.1);
    previous = x;
  }
  expect(previous).toBeGreaterThan(.1 * .98);
});
