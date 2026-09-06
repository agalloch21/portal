import { expect, it } from 'vitest';
import { Quaternion, Vector3, Euler } from 'three';
import { EyeMotionFrame } from '../src/eye-motion';
import { EyeFilter } from '../src/eye-filter';
import { offAxisEye } from '../src/view';

it('phone tilt with a stationary head cannot become amplified reverse eye motion', () => {
  for (const sign of [-1, 1]) {
    const frame = new EyeMotionFrame(), filter = new EyeFilter();
    const head = new Vector3(0, 20, 350);
    for (let i = 0; i < 10; i++) filter.sample(frame.observation(head, new Quaternion()).eye, i * 40);
    let offset = { x: 0, y: 0 };
    for (let i = 1; i <= 40; i++) {
      const pose = new Quaternion().setFromEuler(new Euler(sign * i / 100, 0, 0));
      const cameraEye = head.clone().applyQuaternion(pose.clone().invert());
      filter.sample(frame.observation(cameraEye, pose).eye, 360 + i * 40);
      offset = frame.screenOffset(filter.update(.04, 360 + i * 40), pose);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThan(1e-10);
      const eye = offAxisEye(offset);
      const ray = new Vector3(-eye.x, -eye.y, -eye.z).normalize().applyQuaternion(pose);
      expect(Math.sign(ray.y)).toBe(sign);
    }
  }
});
it('retains actual head translation while the phone is tilted', () => {
  const frame = new EyeMotionFrame();
  frame.observation({ x: 0, y: 0, z: 350 }, new Quaternion());
  const pose = new Quaternion().setFromEuler(new Euler(.3, .2, 0));
  const actual = new Vector3(50, 30, 350).applyQuaternion(pose.clone().invert());
  const mapped = frame.observation(actual, pose);
  expect(mapped.eye.x).toBeCloseTo(50);
  expect(mapped.eye.y).toBeCloseTo(30);
  expect(mapped.eye.z).toBeCloseTo(350);
});
it('requires new calibration on sensor availability transitions, not every observation', () => {
  const frame = new EyeMotionFrame(), eye = { x: 0, y: 0, z: 350 };
  expect(frame.observation(eye, null).changed).toBe(false);
  expect(frame.observation(eye, new Quaternion()).changed).toBe(true);
  expect(frame.observation(eye, new Quaternion()).changed).toBe(false);
  expect(frame.observation(eye, null).changed).toBe(true);
});
it('keeps camera-only tracking in screen coordinates', () => {
  const frame = new EyeMotionFrame(), eye = { x: 10, y: 20, z: 350 };
  expect(frame.observation(eye, null).eye).toEqual(eye);
  expect(frame.screenOffset({ x: .3, y: -.2 }, null)).toEqual({ x: .3, y: -.2 });
});
