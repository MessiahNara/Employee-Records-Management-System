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
      host: true,
      port: devPort,
      strictPort: true,
      https: true,
      proxy: {
        '/api': {
          target: 'https://192.168.2.187:5000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: 'https://192.168.2.187:5000',
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
