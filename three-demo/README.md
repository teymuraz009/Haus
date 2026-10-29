# Three.js + GSAP: покадровый рендер в MP4

Демо: мультяшный робот в лесу (выход, прыжок, взмах рукой, моргание, проезд камеры). 4 секунды, 1920×1080, 24 кадра/с.
Готовое видео: [`out/three_gsap_demo.mp4`](out/three_gsap_demo.mp4)

```bash
node three-demo/render.cjs <папка_для_кадров> three-demo/out/three_gsap_demo.mp4   # ~30 с
npx vite --config three-demo/vite.config.ts      # просмотр в браузере: http://localhost:5180
npx tsc -p three-demo                            # проверка типов
```

## Как устроено
- `main.ts`: сцена Three.js и таймлайн GSAP **на паузе**. Кадр `i` выставляется через `tl.seek(i / FPS)`, поэтому рендер детерминированный и не зависит от скорости машины.
- `render.cjs`: поднимает Vite на порту 5180, открывает страницу в Chromium (Playwright, WebGL через SwiftShader), снимает кадры `toDataURL` (нужен `preserveDrawingBuffer: true`) и собирает MP4 через ffmpeg.
- Отдельный `vite.config.ts` и `tsconfig.json`: корневые заняты Motion Canvas.

## Замеры (облачная сессия, 4 CPU, без видеокарты)
- **0,25–0,27 с на кадр Full HD**: 96 кадров за 24–26 с. Это примерно в 25 раз быстрее Blender Cycles (7 с на кадр при 960 px).
- Тени (PCFSoft 2048), туман, тональная коррекция ACES работают.

## Грабли
- Vite запускать напрямую через `node_modules/.bin/vite`, не через `npx`: иначе `kill()` останавливает только `npx`, сервер остаётся жить и скрипт не завершается.
- Модули ES не грузятся с `file://` (CORS), поэтому нужен локальный сервер.
- React Three Fiber не подключён: JSX в корневом `tsconfig` настроен на Motion Canvas (`jsxImportSource: @motion-canvas/2d/lib`), JSX от React с ним конфликтует.
