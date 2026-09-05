import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const key = process.env.PORTAL_HTTPS_KEY;
const cert = process.env.PORTAL_HTTPS_CERT;
if (Boolean(key) !== Boolean(cert)) throw new Error('Set both PORTAL_HTTPS_KEY and PORTAL_HTTPS_CERT.');

export default defineConfig({
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    https: key && cert ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined,
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
});
