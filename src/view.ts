export const DEFAULT_FOV = 60;
/** Fixed short-axis projection; eye tracking cannot change focal distance. */
export function panoramaView(width: number, height: number) {
  const size = { width: width / Math.min(width, height), height: height / Math.min(width, height) };
  return { size, eye: { x: 0, y: 0, z: 1 / (2 * Math.tan(DEFAULT_FOV * Math.PI / 360)) } };
}
