import { readFileSync } from 'node:fs';
import { build, defineConfig } from 'vite';
import { resolve } from 'node:path';

const key = process.env.PORTAL_HTTPS_KEY;
const cert = process.env.PORTAL_HTTPS_CERT;
if (Boolean(key) !== Boolean(cert)) throw new Error('Set both PORTAL_HTTPS_KEY and PORTAL_HTTPS_CERT.');

export default defineConfig({
  plugins: [{
    name: 'portal-classic-face-worker',
    apply: 'serve',
    configureServer(server) {
      // Dev normally serves worker ESM directly. Bundle this one to classic JS,
      // matching production and allowing MediaPipe's importScripts WASM loader.
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== `${server.config.base}__portal_face_worker.js`) return next();
        try {
          const built = await build({ configFile: false, logLevel: 'silent', root: server.config.root,
            build: { write: false, lib: { entry: resolve(server.config.root, 'src/face-worker.ts'), name: 'PortalFaceWorker', formats: ['iife'] } } });
          const output = Array.isArray(built) ? built[0] : built;
          if (!('output' in output)) throw new Error('Worker build produced no output');
          const chunk = output.output.find(item => item.type === 'chunk');
          if (!chunk || chunk.type !== 'chunk') throw new Error('Worker build produced no script');
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end(chunk.code);
        } catch (error) { next(error); }
      });
    },
  }],
  worker: { format: 'iife' },
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    https: key && cert ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined,
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
});
