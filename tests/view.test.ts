import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { offAxisEye, offAxisProjection, panoramaView, parseEyeGain } from '../src/view';

it('defaults to unit displacement and only scales lateral eye position', () => {
  const unit = offAxisEye({ x: .2, y: -.1 }), triple = offAxisEye({ x: .2, y: -.1 }, 3);
  expect(triple.x).toBeCloseTo(unit.x * 3);
  expect(triple.y).toBeCloseTo(unit.y * 3);
  expect(triple.z).toBe(unit.z);
  expect(unit.x / unit.z).toBeCloseTo(.2);
});
it('uses asymmetric rays through a fixed screen rather than rotating the camera', () => {
  const { size } = panoramaView(390, 844);
  const eye = offAxisEye({ x: .6, y: .2 });
  const ray = (x: number) => new Vector3(x - eye.x, -eye.y, -eye.z).normalize();
  const center = ray(0);
  expect(center.x).toBeLessThan(0);
  expect(center.y).toBeLessThan(0);
  expect(ray(-size.width / 2).angleTo(center)).not.toBeCloseTo(ray(size.width / 2).angleTo(center));
});
it('particle projection matches panorama rays at the center and corners in both orientations', () => {
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const { size } = panoramaView(w, h);
    for (const gain of [1, 3]) {
      const eye = offAxisEye({ x: .4, y: -.2 }, gain);
      const projection = offAxisProjection(size, eye, .1, 100);
      for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
        const cameraPoint = new Vector3(x * size.width / 2 - eye.x, y * size.height / 2 - eye.y, -eye.z);
        const ndc = cameraPoint.applyMatrix4(projection);
        expect(ndc.x).toBeCloseTo(x, 10);
        expect(ndc.y).toBeCloseTo(y, 10);
      }
    }
  }
});
it('retains a symmetric 60 degree short-axis view at the centered eye', () => {
  const { size, eye } = panoramaView(390, 844);
  const a = new Vector3(-size.width / 2, 0, -eye.z), b = new Vector3(size.width / 2, 0, -eye.z);
  expect(a.angleTo(b) * 180 / Math.PI).toBeCloseTo(60);
});
it('rejects invalid saved multipliers and accepts the supported range', () => {
  for (const value of [null, '3', NaN, Infinity, 0, .5, .9, 9, {}]) expect(parseEyeGain(value)).toBe(1);
  for (const value of [1, 1.1, 2.5, 3]) expect(parseEyeGain(value)).toBe(value);
});
