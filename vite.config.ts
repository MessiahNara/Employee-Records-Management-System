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

try {
  const rootTemplate = path.resolve(__dirname, 'NAP-FORM-3-Template.docx');
  const pubTemplate = path.resolve(__dirname, 'public', 'NAP-FORM-3-Template.docx');
  if (fs.existsSync(rootTemplate) && !fs.existsSync(pubTemplate)) {
    fs.copyFileSync(rootTemplate, pubTemplate);
    console.log('Copied NAP-FORM-3-Template.docx to public/');
  }
} catch (e) {
  console.error('Error copying NAP-FORM-3 template:', e);
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
          target: 'https://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: 'https://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: 'https://127.0.0.1:5000',
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
