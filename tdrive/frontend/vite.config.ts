import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

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
    port: 3000,
    proxy: {
      '/internal': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/plugins': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  // Serve files from public/ directory
  publicDir: 'public',
});
