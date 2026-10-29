import {defineConfig} from 'vite';

// Отдельный конфиг: корневой vite.config.ts занят редактором Motion Canvas.
export default defineConfig({
  root: __dirname,
  server: {port: 5181, strictPort: true},
});
