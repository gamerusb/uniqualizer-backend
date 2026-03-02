// POST /api/transcribe
// Принимает аудио (WAV/MP3) → возвращает сегменты субтитров

import express from 'express';
import multer from 'multer';
import path from 'path';
import { transcribeAudio } from '../services/groq.js';
import { resolveUser } from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter(req, file, cb) {
    const allowed = ['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.mp4'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Формат не поддерживается: ${ext}`));
  },
});

router.post('/', resolveUser, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Аудио-файл обязателен' });
    }

    const { language = 'auto', stylePreset, duration } = req.body;

    const result = await transcribeAudio({
      audioPath: req.file.path,
      language,
    });

    res.json({
      success: true,
      text: result.text,
      language: result.language,
      duration: result.duration,
      segments: result.segments,
      stylePreset: stylePreset || 'tiktok',
    });
  } catch (err) {
    console.error('[transcribe]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
