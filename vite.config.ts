import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

try {
  fs.copyFileSync(
    path.resolve(__dirname, 'public', 'template.xlsx'),
    path.resolve(__dirname, 'public', 'ao_template.xlsx')
  );
  console.log('Restored ao_template.xlsx successfully from public/template.xlsx');
} catch (e) {
  console.error('Error copying template:', e);
}
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(() => {
  const devPort = 5174;

  return {
    plugins: [react(), basicSsl()],
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
        '/socket.io': {
          target: 'https://localhost:5000',
          ws: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      port: devPort,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
