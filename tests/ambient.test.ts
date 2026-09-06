import { expect, it } from 'vitest';
import { createAmbient, type Atmosphere } from '../src/ambient';

const themes: Record<Atmosphere, string[]> = {
  dream: ['dream-floating-lights', 'dream-light-tide'],
  underwater: ['underwater-bubbles', 'underwater-lightshaft', 'underwater-fish'],
  space: ['space-orbiting-stars'],
  greenhouse: ['colored-meteor-shower'],
  clouds: ['drifting-cloud-veil'],
  moonforest: ['moonforest-fireflies'],
  forest: ['forest-sunshaft'],
  lake: ['lake-ripples'],
};
for (const [kind, expected] of Object.entries(themes)) {
  it(`${kind} contains only its own effects and releases them`, () => {
    const world = createAmbient(kind as Atmosphere);
    expect([...new Set(world.scene.children.map(child => child.name))].sort()).toEqual([...expected].sort());
    world.update(7, 2);
    world.dispose();
    expect(world.scene.children).toHaveLength(0);
  });
}
