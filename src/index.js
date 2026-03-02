// ─────────────────────────────────────────────────────────────────────────────
// UNIQUALIZER PRO — Backend Server
// Node.js + Express
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import transcribeRoute from './routes/transcribe.js';
import translateCaptionsRoute from './routes/translateCaptions.js';
import exportSrtRoute from './routes/exportSrt.js';
import generateCreativesRoute from './routes/generateCreatives.js';
import importYoutubeRoute from './routes/importYoutube.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

// ── DIRS ──────────────────────────────────────────────────────────────────────
['uploads', 'results'].forEach(dir => {
  const p = path.resolve(dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Статика для результатов и загрузок
app.use('/results', express.static(path.resolve('results')));
app.use('/uploads', express.static(path.resolve('uploads')));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/transcribe', transcribeRoute);
app.use('/api/translate-captions', translateCaptionsRoute);
app.use('/api/export-srt', exportSrtRoute);
app.use('/api/generate-creatives', generateCreativesRoute);
app.use('/api/import-youtube', importYoutubeRoute);
app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       UNIQUALIZER PRO — Backend v1.0         ║
║                                              ║
║  🚀 Running on  http://localhost:${PORT}        ║
║  📋 Health      http://localhost:${PORT}/health ║
║                                              ║
║  Endpoints:                                  ║
║  POST /api/transcribe                        ║
║  POST /api/translate-captions                ║
║  POST /api/export-srt                        ║
║  POST /api/generate-creatives                ║
║  POST /api/import-youtube                    ║
║  GET  /api/offers                            ║
║  GET  /api/creatives                         ║
║  GET  /api/me                                ║
╚══════════════════════════════════════════════╝
  `);
});

export default app;
