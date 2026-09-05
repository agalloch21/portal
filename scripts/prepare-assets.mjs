import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, 'public/wasm'), { recursive: true });
await mkdir(resolve(root, 'public/models'), { recursive: true });
const runtimeFiles = await readdir(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'));
for (const name of await readdir(resolve(root, 'public/wasm'))) {
  if (/^vision_wasm_.*\.(js|wasm)$/.test(name) && !runtimeFiles.includes(name)) await rm(resolve(root, 'public/wasm', name));
}
for (const name of runtimeFiles) {
  if (name.endsWith('.js') || name.endsWith('.wasm')) {
    await copyFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm', name), resolve(root, 'public/wasm', name));
  }
}
const destination = resolve(root, 'public/models/face_landmarker.task');
if (!(await stat(destination).catch(() => null))?.size) {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}
console.log('Local MediaPipe WASM and face model ready.');
