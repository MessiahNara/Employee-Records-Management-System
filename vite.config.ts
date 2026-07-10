import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import path from 'path';

export default defineConfig(() => {
  const devPort = 5174;

  return {
    plugins: [react(), mkcert()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    base: './',
    server: {
      host: false,
      port: devPort,
      strictPort: true,
      https: true,
      proxy: {
        '/api': {
          target: 'https://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: 'https://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      port: devPort,
      strictPort: true,
      https: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
