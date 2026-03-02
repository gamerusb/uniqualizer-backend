// ─────────────────────────────────────────────────────────────────────────────
// GROQ AI SERVICE
// Whisper для транскрипции, Chat для перевода и генерации метаданных
// ─────────────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import fs from 'fs';

let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// ── TRANSCRIPTION ─────────────────────────────────────────────────────────────

export async function transcribeAudio({ audioPath, language = 'auto', responseFormat = 'verbose_json' }) {
  const client = getGroq();

  const params = {
    file: fs.createReadStream(audioPath),
    model: 'whisper-large-v3',
    response_format: responseFormat,
    timestamp_granularities: ['segment'],
  };

  if (language && language !== 'auto') {
    params.language = language;
  }

  const response = await client.audio.transcriptions.create(params);

  // Normalize to segments array
  const segments = (response.segments || []).map((seg, i) => ({
    id: i,
    start: Math.round(seg.start * 1000), // ms
    end: Math.round(seg.end * 1000),
    text: seg.text.trim(),
  }));

  return {
    text: response.text,
    language: response.language || language,
    duration: response.duration,
    segments,
  };
}

// ── TRANSLATION ───────────────────────────────────────────────────────────────

export async function translateCaptions({ captions, targetLanguage }) {
  const client = getGroq();

  const textLines = captions.map((c, i) => `[${i}] ${c.text}`).join('\n');

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `Ты профессиональный переводчик субтитров. Переведи каждую строку на ${targetLanguage}. 
Сохрани формат: [индекс] текст. Одна строка — один субтитр. Только перевод, никаких комментариев.`,
      },
      { role: 'user', content: textLines },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const lines = completion.choices[0].message.content.split('\n').filter(Boolean);
  const translated = [...captions];

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s+(.+)$/);
    if (match) {
      const idx = parseInt(match[1]);
      if (translated[idx]) translated[idx] = { ...translated[idx], text: match[2] };
    }
  }

  return translated;
}

// ── YOUTUBE METADATA GENERATION ───────────────────────────────────────────────

export async function generateYoutubeMeta({ originalTitle, originalDescription, originalTags = [] }) {
  const client = getGroq();

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `Ты эксперт по YouTube SEO и арбитражу трафика. 
Твоя задача: переработать метаданные видео так, чтобы:
- сохранить смысл и ключевые слова
- убрать явные бренды и названия каналов
- сделать 3 варианта заголовков (разный угол подачи)
- подобрать релевантные теги (15-20 штук)
- написать описание 2-3 предложения

Ответь ТОЛЬКО в JSON формате:
{
  "titles": ["заголовок 1", "заголовок 2", "заголовок 3"],
  "description": "описание",
  "tags": ["тег1", "тег2", ...]
}`,
      },
      {
        role: 'user',
        content: `Оригинальный заголовок: ${originalTitle}
Описание: ${originalDescription || 'нет'}
Теги: ${originalTags.join(', ') || 'нет'}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  try {
    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      titles: [originalTitle],
      description: originalDescription || '',
      tags: originalTags,
    };
  }
}

// ── BAN SCORE CALCULATOR ──────────────────────────────────────────────────────

export async function calculateBanScore({ uniqIntensity, variations, hasTranslation, hasCustomSubtitles, platform }) {
  // Простая эвристика без AI (можно расширить)
  let score = 0;

  // Интенсивность уникализации снижает риск
  score += Math.round((100 - uniqIntensity) / 10);

  // Больше вариаций = каждая более уникальна
  if (variations >= 3) score -= 2;

  // Перевод = дополнительная уникализация
  if (hasTranslation) score -= 2;

  // Кастомные субтитры = визуальное отличие
  if (hasCustomSubtitles) score -= 1;

  // TikTok/Reels более строгие
  if (['tiktok', 'reels'].includes(platform)) score += 2;

  score = Math.max(0, Math.min(10, score));

  if (score <= 3) return 'low';
  if (score <= 6) return 'medium';
  return 'high';
}
