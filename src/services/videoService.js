// ─────────────────────────────────────────────────────────────────────────────
// VIDEO UNIQUALIZATION SERVICE
// Применяет визуальные эффекты для анти-детект уникализации
// На фронтенде: canvas + MediaRecorder
// На бэкенде: заглушка (в реальном проде — FFmpeg или cloud render)
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const RESULTS_DIR = path.resolve('results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// Параметры уникализации по режиму
export const UNIQ_MODES = {
  DEEP_VISUAL: {
    colorShift: true,       // цветокоррекция HSL
    zoomPan: true,          // лёгкий zoom 1-3%
    noiseOverlay: true,     // шум поверх кадра
    metadataStrip: true,    // очистка exif/метаданных
    audioShift: false,
    recompress: false,
  },
  PHANTOM: {
    colorShift: true,
    zoomPan: true,
    noiseOverlay: true,
    metadataStrip: true,
    audioShift: true,       // питч-сдвиг аудио ±2%
    recompress: true,       // пересжатие с новыми параметрами
  },
};

// Профили платформ
export const PLATFORM_SPECS = {
  tiktok:   { width: 1080, height: 1920, fps: 30, maxDuration: 180, format: 'mp4' },
  reels:    { width: 1080, height: 1920, fps: 30, maxDuration: 90,  format: 'mp4' },
  shorts:   { width: 1080, height: 1920, fps: 30, maxDuration: 60,  format: 'mp4' },
  facebook: { width: 1280, height: 720,  fps: 30, maxDuration: 240, format: 'mp4' },
};

// Стили субтитров (параметры для canvas/overlay)
export const SUBTITLE_STYLES = {
  tiktok:   { fontFamily: 'Impact', fontSize: 52, color: '#FFFFFF', stroke: '#000000', strokeWidth: 4, position: 'bottom', bg: 'rgba(0,0,0,0.3)' },
  youtube:  { fontFamily: 'Roboto', fontSize: 38, color: '#FFFFFF', stroke: 'none',    strokeWidth: 0, position: 'bottom', bg: 'rgba(0,0,0,0.6)' },
  anime:    { fontFamily: 'Impact', fontSize: 58, color: '#FFD700', stroke: '#000000', strokeWidth: 6, position: 'bottom', bg: 'transparent' },
  news:     { fontFamily: 'Arial',  fontSize: 34, color: '#FFFFFF', stroke: 'none',    strokeWidth: 0, position: 'top',    bg: '#CC0000' },
  neon:     { fontFamily: 'Impact', fontSize: 52, color: '#00F5D4', stroke: '#005544', strokeWidth: 3, position: 'bottom', bg: 'transparent', glow: true },
  minimal:  { fontFamily: 'Helvetica', fontSize: 32, color: '#FFFFFF', stroke: 'none', strokeWidth: 0, position: 'bottom', bg: 'transparent' },
  karaoke:  { fontFamily: 'Arial',  fontSize: 46, color: '#FFFF00', stroke: '#000000', strokeWidth: 3, position: 'center', bg: 'rgba(0,0,0,0.5)' },
  reels:    { fontFamily: 'Impact', fontSize: 54, color: '#FFFFFF', stroke: '#E1306C', strokeWidth: 4, position: 'bottom', bg: 'transparent' },
};

/**
 * generateCreativeVariation
 * В продакшене здесь будет FFmpeg-пайплайн или вызов cloud-render.
 * Сейчас возвращает мета-данные с уникальными параметрами для каждой вариации,
 * которые фронтенд использует для canvas-рендера.
 */
export function generateCreativeVariation({
  variationIndex,
  mode,
  platform,
  subtitleStyle,
  uniqIntensity,
  captions,
  duration,
  offerId,
}) {
  const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.tiktok;
  const modeParams = UNIQ_MODES[mode] || UNIQ_MODES.DEEP_VISUAL;
  const styleParams = SUBTITLE_STYLES[subtitleStyle] || SUBTITLE_STYLES.tiktok;

  // Каждая вариация получает слегка разные параметры
  const seed = variationIndex + 1;
  const intensityFactor = uniqIntensity / 100;

  const variation = {
    id: `var_${randomUUID().slice(0, 6)}`,
    variationIndex,
    platform,
    spec,
    uniqParams: {
      ...modeParams,
      colorHue: (Math.sin(seed * 1.7) * 15 * intensityFactor).toFixed(1),        // ±15° сдвиг hue
      colorSat: (1 + Math.sin(seed * 2.3) * 0.2 * intensityFactor).toFixed(2),   // ±20% насыщенность
      colorBright: (1 + Math.cos(seed * 1.1) * 0.1 * intensityFactor).toFixed(2), // ±10% яркость
      zoomFactor: (1 + (0.01 + seed * 0.005) * intensityFactor).toFixed(3),       // zoom 1-3%
      panX: Math.round(Math.sin(seed * 3.1) * 20 * intensityFactor),              // pan X px
      panY: Math.round(Math.cos(seed * 2.7) * 15 * intensityFactor),              // pan Y px
      noiseOpacity: (0.03 + seed * 0.01 * intensityFactor).toFixed(3),            // шум прозрачность
      startTimecode: seed * 0.3,                                                   // разный старт
    },
    subtitleParams: {
      ...styleParams,
      // Небольшая вариация размера шрифта между вариациями
      fontSize: styleParams.fontSize + (seed % 3 - 1) * 2,
    },
    captions: captions || [],
    duration,
    outputFilename: `${offerId}_${platform}_v${seed}_${randomUUID().slice(0, 4)}.mp4`,
  };

  return variation;
}

/**
 * generateThumb
 * Возвращает параметры для генерации обложки (скриншот кадра + текст)
 */
export function generateThumbParams({ variationIndex, captions, platform }) {
  const firstCaption = captions[0]?.text || '';
  return {
    frame: variationIndex === 0 ? 0.1 : variationIndex === 1 ? 0.3 : 0.5, // % от длины
    overlayText: firstCaption.slice(0, 60),
    platform,
    filename: `thumb_v${variationIndex + 1}_${randomUUID().slice(0, 4)}.jpg`,
  };
}
