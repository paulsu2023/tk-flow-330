
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    // Explicitly define process.env.API_KEY so it's replaced by the actual string value during build
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://100.55.152.110:8000',
          changeOrigin: true,
        }
      }
    },
    build: {
      // Phase 1 Protection: Disable Source Maps to prevent full source code reconstruction in browser DevTools
      sourcemap: false, 
    },
  };
});
