import { defineConfig } from 'vite';

// Le navigateur ne peut pas appeler Yahoo Finance directement (CORS) :
// le serveur local relaie les requêtes /yahoo/* vers l'API.
const yahooProxy = {
  '/yahoo': {
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/yahoo/, ''),
    headers: { 'User-Agent': 'Mozilla/5.0 (TrackUrInvests)' },
  },
};

export default defineConfig({
  server: { proxy: yahooProxy },
  preview: { proxy: yahooProxy },
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: 'node' },
});
