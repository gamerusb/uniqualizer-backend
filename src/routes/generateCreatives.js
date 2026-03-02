// POST /api/generate-creatives  (multipart/form-data)
// Основной PRO-эндпоинт: принимает видео → возвращает N вариаций креативов

import express from 'express';
import multer from 'multer';
import path from 'path';
import { transcribeAudio, translateCaptions, calculateBanScore } from '../services/groq.js';
import { generateCreativeVariation, generateThumbParams } from '../services/videoService.js';
import { renderCreativeVariant } from '../services/renderService.js';
import { UserStore, OfferStore, CreativeStore, PresetStore, canProcessCreative } from '../stores/index.js';
import { resolveUser } from '../middleware/auth.js';
import { isR2Configured, uploadFileToR2, copyObjectInR2, deleteObjectFromR2, getSignedDownloadUrl } from '../services/r2.js';
import { randomUUID } from 'crypto';
import fs from 'fs';

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter(req, file, cb) {
    const allowed = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Формат не поддерживается: ${ext}`));
  },
});

router.post('/', resolveUser, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Видео-файл обязателен' });
    }

    const {
      offerId,
      platforms: platformsRaw = '["tiktok"]',
      scenario = 'ugc',
      inputLanguage = 'auto',
      translateTo = '',
      durationType = '30',
      customDuration,
      subtitleStyle = 'tiktok',
      uniqIntensity: intensityRaw = '50',
      variations: variationsRaw = '1',
      generateThumbs = 'false',
      calcBanScore = 'false',
      saveAsPreset = 'false',
      uniqMode = 'DEEP_VISUAL',
    } = req.body;

    const platforms = JSON.parse(platformsRaw);
    const variations = Math.min(parseInt(variationsRaw) || 1, 10);
    const uniqIntensity = parseInt(intensityRaw) || 50;
    const durationSec = durationType === 'custom' ? parseInt(customDuration) || 30
      : parseInt(durationType) || 30;

    // ── 1. Проверка лимитов ──────────────────────────────────────────────────
    const check = canProcessCreative(req.user, {
      videoDurationSec: durationSec,
      variations,
      isYoutubeImport: false,
    });

    if (!check.allowed) {
      return res.status(403).json({ success: false, error: check.reason });
    }

    // ── 1.5 Попытаться загрузить оригинал в R2 (если настроен) ──────────────
    let r2Enabled = false;
    let sourceKey = null;
    if (isR2Configured()) {
      try {
        sourceKey = `sources/${req.user.id}/${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
        await uploadFileToR2({
          key: sourceKey,
          filePath: req.file.path,
          contentType: req.file.mimetype || 'video/mp4',
          cacheControl: 'private, max-age=0, no-cache',
        });
        r2Enabled = true;
      } catch (r2Err) {
        console.warn('[generate-creatives] R2 upload failed, falling back to local results/:', r2Err.message);
        r2Enabled = false;
        sourceKey = null;
      }
    }

    // ── 2. Транскрипция (один раз для всех вариаций) ─────────────────────────
    let captions = [];
    let transcriptionLanguage = inputLanguage;

    try {
      const transcription = await transcribeAudio({
        audioPath: req.file.path,
        language: inputLanguage,
      });
      captions = transcription.segments;
      transcriptionLanguage = transcription.language;
    } catch (transcribeErr) {
      console.warn('[generate-creatives] Transcription failed, continuing without captions:', transcribeErr.message);
    }

    // ── 3. Перевод субтитров (если нужен) ────────────────────────────────────
    if (translateTo && translateTo !== inputLanguage && captions.length > 0) {
      try {
        captions = await translateCaptions({ captions, targetLanguage: translateTo });
      } catch (translateErr) {
        console.warn('[generate-creatives] Translation failed:', translateErr.message);
      }
    }

    // ── 4. Генерация вариаций для каждой платформы ───────────────────────────
    const creatives = [];

    for (const platform of platforms) {
      for (let i = 0; i < variations; i++) {
        const variation = generateCreativeVariation({
          variationIndex: i,
          mode: uniqMode,
          platform,
          subtitleStyle,
          uniqIntensity,
          captions,
          duration: durationSec,
          offerId: offerId || 'no_offer',
        });

        // Ban score
        let banScore = null;
        if (calcBanScore === 'true' || req.user.plan === 'PRO' || req.user.plan === 'PREMIUM') {
          banScore = await calculateBanScore({
            uniqIntensity,
            variations,
            hasTranslation: Boolean(translateTo),
            hasCustomSubtitles: subtitleStyle !== 'none',
            platform,
          });
        }

        // Thumbs
        let thumbParams = null;
        if (generateThumbs === 'true') {
          thumbParams = generateThumbParams({ variationIndex: i, captions, platform });
        }

        // ── Вычислить downloadUrl / ключи ────────────────────────────────────
        let downloadUrl = `/results/${variation.outputFilename}`;
        let downloadKey = null;

        if (r2Enabled && sourceKey) {
          try {
            const resultKey = `results/${variation.outputFilename}`;
            await copyObjectInR2({
              sourceKey,
              destKey: resultKey,
              contentType: req.file.mimetype || 'video/mp4',
              cacheControl: 'private, max-age=0, no-cache',
            });
            downloadKey = resultKey;
            downloadUrl = await getSignedDownloadUrl({
              key: resultKey,
              filename: variation.outputFilename,
            });
          } catch (r2CopyErr) {
            console.warn('[generate-creatives] R2 copy/signed URL failed, using local /results path:', r2CopyErr.message);
            downloadKey = null;
            downloadUrl = `/results/${variation.outputFilename}`;
          }
        } else {
          // Локальный рендер через FFmpeg
          try {
            await renderCreativeVariant({
              inputPath: req.file.path,
              variation,
            });
          } catch (fsErr) {
            console.warn('[generate-creatives] local render to results/ failed:', fsErr.message);
          }
        }

        // Сохранить в store
        const creative = await CreativeStore.create({
          userId: req.user.id,
          offerId: offerId || null,
          platform,
          scenario,
          subtitleStyle,
          uniqIntensity,
          variation: i + 1,
          language: translateTo || transcriptionLanguage,
          banScore,
          thumbParams,
          uniqParams: variation.uniqParams,
          captionsCount: captions.length,
          downloadKey,
          downloadUrl,
          thumbKey: null,
          thumbUrl: null,
          status: 'ready', // в реальном проде: 'processing' → 'ready'
        });

        creatives.push({
          id: creative.id,
          variationIndex: i + 1,
          platform,
          downloadUrl,
          thumbUrl: creative.thumbUrl,
          language: creative.language,
          subtitleStyle,
          banScore,
          uniqParams: variation.uniqParams, // для canvas-рендера на фронте
          subtitleParams: variation.subtitleParams,
          captions,
        });
      }
    }

    // ── 5. Сохранить пресет (если запрошено) ─────────────────────────────────
    if (saveAsPreset === 'true' && offerId) {
      await PresetStore.save({
        userId: req.user.id,
        offerId,
        settings: { platforms, scenario, inputLanguage, translateTo, durationType, subtitleStyle, uniqIntensity, variations },
      });
    }

    // ── 6. Обновить счётчик пользователя ─────────────────────────────────────
    await UserStore.incrementVideoCount(req.user.id);

    // Cleanup: delete temporary source object + local upload
    try { await deleteObjectFromR2({ key: sourceKey }); } catch {}
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({
      success: true,
      creatives,
      captions,
      meta: {
        offerId: offerId || null,
        platforms,
        scenario,
        variations,
        duration: durationSec,
        language: transcriptionLanguage,
      },
    });
  } catch (err) {
    console.error('[generate-creatives]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
