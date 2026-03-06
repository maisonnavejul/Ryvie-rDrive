import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import fs from 'fs';

// Read version from root package.json (local dev: ../package.json, Docker build: /tdrive-root-package.json)
let APP_VERSION = '0.0.1';
try {
  const localPath = path.resolve(__dirname, '../package.json');
  const dockerPath = '/tdrive-root-package.json';
  const pkgPath = fs.existsSync(localPath) ? localPath : fs.existsSync(dockerPath) ? dockerPath : null;
  if (pkgPath) {
    const rootPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    APP_VERSION = rootPkg.version || APP_VERSION;
  }
} catch { /* fallback to default */ }

export default defineConfig({
  plugins: [
    react(),
    svgr({
      // Enable the { ReactComponent } named export pattern (CRA compat)
      svgrOptions: {
        exportType: 'named',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg',
    }),
  ],
  resolve: {
    alias: {
      'src': path.resolve(__dirname, './src'),
      'app': path.resolve(__dirname, './src/app'),
      'environment': path.resolve(__dirname, './src/app/environment'),
      'components': path.resolve(__dirname, './src/app/components'),
      'features': path.resolve(__dirname, './src/app/features'),
      'services': path.resolve(__dirname, './src/app/services'),
      'deprecated': path.resolve(__dirname, './src/app/deprecated'),
      'styles': path.resolve(__dirname, './src/app/styles'),
      'views': path.resolve(__dirname, './src/app/views'),
      '@app': path.resolve(__dirname, './src/app'),
      '@environment': path.resolve(__dirname, './src/app/environment'),
      '@components': path.resolve(__dirname, './src/app/components'),
      '@features': path.resolve(__dirname, './src/app/features'),
      '@services': path.resolve(__dirname, './src/app/services'),
      '@deprecated': path.resolve(__dirname, './src/app/deprecated'),
      '@styles': path.resolve(__dirname, './src/app/styles'),
      '@atoms': path.resolve(__dirname, './src/app/atoms'),
      '@molecules': path.resolve(__dirname, './src/app/molecules'),
      '@views': path.resolve(__dirname, './src/app/views'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        // Resolve ~ imports to node_modules (webpack convention)
        paths: [path.resolve(__dirname, 'node_modules')],
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3010,
    proxy: {
      '/internal': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/plugins': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure: (proxy) => {
          // 10 min timeout pour les longues sync cloud
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.socket?.setTimeout(600000);
          });
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.socket?.setTimeout(600000);
          });
        },
      },
    },
  },
  define: {
    '__APP_VERSION__': JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  // Serve files from public/ directory
  publicDir: 'public',
});
