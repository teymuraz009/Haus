#!/usr/bin/env bash
# Полная сборка «Винтика»: кадры (Three.js + GSAP в Chromium) -> звук (numpy) -> MP4.
# ./build.sh [папка_для_кадров]     (~20 мин на 852 кадра Full HD)
set -euo pipefail
cd "$(dirname "$0")"
FR="${1:-frames}"
rm -rf "$FR"
node render.cjs "$FR"
python3 sound.py "$FR/events.json" "$FR/audio.wav"
./mux.sh "$FR"
