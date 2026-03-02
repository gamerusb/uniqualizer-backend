// POST /api/export-srt
// { captions, filename } → текстовый SRT файл

import express from 'express';

const router = express.Router();

function toSRTTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms2).padStart(3,'0')}`;
}

router.post('/', (req, res) => {
  try {
    const { captions, filename = 'subtitles' } = req.body;

    if (!captions || !Array.isArray(captions)) {
      return res.status(400).json({ success: false, error: 'captions обязательны' });
    }

    const srt = captions.map((c, i) => (
      `${i + 1}\n${toSRTTime(c.start)} --> ${toSRTTime(c.end)}\n${c.text}\n`
    )).join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.srt"`);
    res.send(srt);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
