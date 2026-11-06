import { defineConfig } from 'vite';
import { ervisioPlugin } from '@ervisio/plugin-sdk/vite';
export default defineConfig(ervisioPlugin({ id: 'backup', entry: 'src/index.tsx' }));
