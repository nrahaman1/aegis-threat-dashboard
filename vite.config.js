import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 4200,
    open: true,
    // Proxy all /api/* requests to the Express proxy server
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
