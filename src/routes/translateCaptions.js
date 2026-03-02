// POST /api/translate-captions
// { captions: [{id, start, end, text}], targetLanguage: 'en' }
// → возвращает переведённые субтитры

import express from 'express';
import { translateCaptions } from '../services/groq.js';
import { resolveUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/', resolveUser, async (req, res) => {
  try {
    const { captions, targetLanguage } = req.body;

    if (!captions || !Array.isArray(captions) || captions.length === 0) {
      return res.status(400).json({ success: false, error: 'captions обязательны' });
    }
    if (!targetLanguage) {
      return res.status(400).json({ success: false, error: 'targetLanguage обязателен' });
    }

    const translated = await translateCaptions({ captions, targetLanguage });

    res.json({
      success: true,
      captions: translated,
      targetLanguage,
    });
  } catch (err) {
    console.error('[translate-captions]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
