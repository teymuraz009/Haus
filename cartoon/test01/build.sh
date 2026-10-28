#!/usr/bin/env bash
# Полная сборка: кадры -> звук -> MP4.  ./build.sh [папка_для_кадров]
set -euo pipefail
cd "$(dirname "$0")"
FR="${1:-frames}"
rm -rf "$FR"
node render.cjs "$FR"
python3 sound.py "$FR/events.json" "$FR/audio.wav"
mkdir -p out
ffmpeg -y -loglevel error -framerate 24 -i "$FR/f%04d.png" -i "$FR/audio.wav" \
  -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -tune grain \
  -c:a aac -b:a 160k -shortest -movflags +faststart out/ponchik_test01.mp4
ls -lh out/ponchik_test01.mp4
