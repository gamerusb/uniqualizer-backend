// POST /api/import-youtube
// { url, mode: 'full' | 'clip', start?, end? }
// Имитирует импорт YouTube-видео (в реальном проде: yt-dlp или YouTube API)

import express from 'express';
import { generateYoutubeMeta } from '../services/groq.js';
import { UserStore, canProcessCreative } from '../stores/index.js';
import { resolveUser } from '../middleware/auth.js';

const router = express.Router();

// Парсим YouTube ID из любого формата ссылки
function extractYoutubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // просто ID
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

router.post('/', resolveUser, async (req, res) => {
  try {
    const { url, mode = 'full', start = 0, end } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'url обязателен' });
    }

    // Проверка лимитов
    const check = canProcessCreative(req.user, {
      isYoutubeImport: true,
      videoDurationSec: end ? end - start : 60,
      variations: 1,
    });
    if (!check.allowed) {
      return res.status(403).json({ success: false, error: check.reason });
    }

    const videoId = extractYoutubeId(url);
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Не удалось распознать YouTube ссылку или ID' });
    }

    // ── В реальном продакшене здесь yt-dlp ──────────────────────────────────
    // const ytDlp = spawn('yt-dlp', [...options]);
    // Пока возвращаем мета-заглушку + реальные метаданные через YouTube oEmbed
    // ─────────────────────────────────────────────────────────────────────────

    // Получаем базовые мета через oEmbed (публичный API, без ключа)
    let originalMeta = {
      title: `YouTube Video ${videoId}`,
      description: '',
      tags: [],
      duration: 120,
    };

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        originalMeta.title = data.title || originalMeta.title;
      }
    } catch {
      // oEmbed недоступен — используем дефолт
    }

    // Генерируем новые метаданные через Groq
    let newMeta = null;
    try {
      newMeta = await generateYoutubeMeta({
        originalTitle: originalMeta.title,
        originalDescription: originalMeta.description,
        originalTags: originalMeta.tags,
      });
    } catch (metaErr) {
      console.warn('[import-youtube] Meta generation failed:', metaErr.message);
    }

    // Обновить счётчик YouTube-импортов
    await UserStore.incrementYoutubeCount(req.user.id);

    // В реальном проде tempVideoPath — путь к скачанному файлу
    const tempVideoPath = `uploads/yt_${videoId}_${Date.now()}.mp4`;

    res.json({
      success: true,
      videoId,
      tempVideoPath, // передаётся в дальнейший pipeline как обычный файл
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      mode,
      clip: mode === 'clip' ? { start: Number(start), end: end ? Number(end) : null } : null,
      meta: {
        original: originalMeta,
        generated: newMeta,
      },
    });
  } catch (err) {
    console.error('[import-youtube]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
