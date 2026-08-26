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
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-router-dom') || id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-icons') && !id.includes('react-barcode'))) {
                return 'vendor-react';
              }
              if (id.includes('react-icons')) {
                return 'vendor-icons';
              }
              if (id.includes('exceljs') || id.includes('xlsx') || id.includes('file-saver')) {
                return 'vendor-excel';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('docxtemplater') || id.includes('pizzip') || id.includes('jszip')) {
                return 'vendor-docs';
              }
              if (id.includes('@zxing') || id.includes('qrcode') || id.includes('react-barcode')) {
                return 'vendor-scanner';
              }
              if (id.includes('socket.io-client')) {
                return 'vendor-socket';
              }
            }
          },
        },
      },
    },
  };
});
