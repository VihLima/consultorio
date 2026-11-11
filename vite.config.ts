/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // backups/ holds patient data (npm run backup): the dev server neither
    // watches it (watchers lock folders on Windows) nor serves it.
    watch: { ignored: ['**/backups/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/backups/**'] },
  },
  test: {
    environment: 'node',
  },
});
