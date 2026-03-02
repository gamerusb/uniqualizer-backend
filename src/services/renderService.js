import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

export async function renderCreativeVariant({ inputPath, variation }) {
  const { spec, uniqParams } = variation;
  const { width, height, fps } = spec;
  const {
    colorHue,
    colorSat,
    colorBright,
    zoomFactor,
    panX,
    panY,
    noiseOpacity,
    audioShift,
  } = uniqParams || {};

  const outputPath = path.resolve('results', variation.outputFilename);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const vf = [];

  // Базовое масштабирование под платформу
  vf.push(`scale=${width}:${height}:force_original_aspect_ratio=cover`);

  // Лёгкий zoom/pan
  const zoom = parseFloat(zoomFactor || '1.02');
  const panXpx = panX || 0;
  const panYpx = panY || 0;
  if (zoom !== 1 || panXpx !== 0 || panYpx !== 0) {
    vf.push(`crop=iw/${zoom}:ih/${zoom}:${panXpx}:${panYpx}`);
    vf.push(`scale=${width}:${height}`);
  }

  // Цветокоррекция
  const hueDeg = parseFloat(colorHue || '0');
  const sat = parseFloat(colorSat || '1');
  const bright = parseFloat(colorBright || '1');
  const eqParts = [];
  if (!Number.isNaN(sat) && sat !== 1) eqParts.push(`saturation=${sat.toFixed(2)}`);
  if (!Number.isNaN(bright) && bright !== 1) {
    const b = (bright - 1).toFixed(2);
    eqParts.push(`brightness=${b}`);
  }
  if (eqParts.length > 0) vf.push(`eq=${eqParts.join(':')}`);
  if (!Number.isNaN(hueDeg) && hueDeg !== 0) {
    vf.push(`hue=h=${hueDeg.toFixed(1)}`);
  }

  // Шум
  const noise = parseFloat(noiseOpacity || '0.05');
  if (!Number.isNaN(noise) && noise > 0) {
    const strength = Math.min(20, Math.max(2, Math.round(noise * 100)));
    vf.push(`noise=alls=${strength}:allf=t`);
  }

  // FPS нормализация
  if (fps) {
    vf.push(`fps=${fps}`);
  }

  const af = [];
  if (audioShift) {
    // Небольшой питч/темпо сдвиг
    af.push('asetrate=44100*1.02,aresample=44100,atempo=1.0');
  }

  const args = [
    '-y',
    '-i', inputPath,
    ...(vf.length ? ['-vf', vf.join(',')] : []),
    ...(af.length ? ['-af', af.join(',')] : []),
    '-map_metadata', '-1',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ];

  await runFfmpeg(args);
  return outputPath;
}

