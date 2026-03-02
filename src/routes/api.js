// /api/offers  — CRUD офферов
// /api/creatives — библиотека креативов пользователя

import express from 'express';
import { OfferStore, CreativeStore } from '../stores/index.js';
import { resolveUser } from '../middleware/auth.js';
import { isR2Configured, getSignedDownloadUrl } from '../services/r2.js';

const router = express.Router();

// ── OFFERS ────────────────────────────────────────────────────────────────────

router.get('/offers', resolveUser, async (req, res) => {
  const offers = await OfferStore.findByUserId(req.user.id);
  res.json({ success: true, offers });
});

router.post('/offers', resolveUser, async (req, res) => {
  try {
    const { name, geo, note } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name обязателен' });
    const offer = await OfferStore.create({ userId: req.user.id, name, geo, note });
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/offers/:id', resolveUser, async (req, res) => {
  await OfferStore.delete(req.params.id);
  res.json({ success: true });
});

// ── CREATIVES ─────────────────────────────────────────────────────────────────

router.get('/creatives', resolveUser, async (req, res) => {
  const { offerId } = req.query;
  const creatives = offerId
    ? await CreativeStore.findByOfferId(offerId)
    : await CreativeStore.findByUserId(req.user.id);

  if (!isR2Configured()) {
    return res.json({ success: true, creatives });
  }

  const withUrls = await Promise.all(creatives.map(async c => {
    if (!c.downloadKey) return c;
    try {
      const filename = c.downloadKey.split('/').pop();
      const url = await getSignedDownloadUrl({ key: c.downloadKey, filename });
      return { ...c, downloadUrl: url };
    } catch {
      return c;
    }
  }));

  res.json({ success: true, creatives: withUrls });
});

// ── USER INFO ─────────────────────────────────────────────────────────────────

router.get('/me', resolveUser, async (req, res) => {
  const { PLAN_LIMITS } = await import('../stores/index.js');
  res.json({
    success: true,
    user: req.user,
    limits: PLAN_LIMITS[req.user.plan],
  });
});

export default router;
