#!/usr/bin/env bash
# Склейка готовых кадров и звука в MP4 (без перерендера).  ./mux.sh <папка_с_кадрами>
set -euo pipefail
cd "$(dirname "$0")"
FR="$1"
mkdir -p out
ffmpeg -y -loglevel error -framerate 24 -i "$FR/f%04d.png" -i "$FR/audio.wav" \
  -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart out/vintik.mp4
ls -lh out/vintik.mp4
