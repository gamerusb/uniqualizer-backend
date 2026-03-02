// ─────────────────────────────────────────────────────────────────────────────
// STORE ABSTRACTION LAYER
// Сейчас: хранение в памяти (Map)
// Потом: заменить реализацию на Mongo/Postgres без изменения интерфейса
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';

// ── PLAN LIMITS ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  FREE: {
    videosPerMonth: 5,
    maxDurationSec: 60,
    maxVariations: 1,
    youtubeImport: false,
    banScore: false,
    thumbs: false,
    presets: false,
  },
  BASIC: {
    videosPerMonth: 50,
    maxDurationSec: 300,
    maxVariations: 3,
    youtubeImport: true,
    youtubeImportsPerMonth: 20,
    banScore: false,
    thumbs: false,
    presets: false,
  },
  PRO: {
    videosPerMonth: 200,
    maxDurationSec: 600,
    maxVariations: 10,
    youtubeImport: true,
    youtubeImportsPerMonth: 100,
    banScore: true,
    thumbs: true,
    presets: true,
  },
  PREMIUM: {
    videosPerMonth: Infinity,
    maxDurationSec: Infinity,
    maxVariations: 10,
    youtubeImport: true,
    youtubeImportsPerMonth: Infinity,
    banScore: true,
    thumbs: true,
    presets: true,
    workspaces: true,
  },
};

// ── USER STORE ────────────────────────────────────────────────────────────────

const usersMap = new Map();

// Seed: demo user
usersMap.set('user_demo', {
  id: 'user_demo',
  email: 'demo@example.com',
  name: 'Demo User',
  plan: 'PRO',
  videosProcessedThisMonth: 47,
  youtubeImportsThisMonth: 3,
  subscriptionExpiry: new Date('2026-12-31'),
  createdAt: new Date(),
});

export const UserStore = {
  async findById(id) {
    return usersMap.get(id) ?? null;
  },

  async findOrCreate(id) {
    if (!usersMap.has(id)) {
      const user = {
        id,
        email: null,
        name: 'User',
        plan: 'FREE',
        videosProcessedThisMonth: 0,
        youtubeImportsThisMonth: 0,
        subscriptionExpiry: null,
        createdAt: new Date(),
      };
      usersMap.set(id, user);
    }
    return usersMap.get(id);
  },

  async incrementVideoCount(id) {
    const user = usersMap.get(id);
    if (user) {
      user.videosProcessedThisMonth += 1;
      usersMap.set(id, user);
    }
  },

  async incrementYoutubeCount(id) {
    const user = usersMap.get(id);
    if (user) {
      user.youtubeImportsThisMonth += 1;
      usersMap.set(id, user);
    }
  },

  async list() {
    return [...usersMap.values()];
  },
};

// ── OFFER STORE ───────────────────────────────────────────────────────────────

const offersMap = new Map();

// Seed data
['offer_001', 'offer_002', 'offer_003'].forEach((id, i) => {
  const seeds = [
    { name: 'Кредитные карты RU', geo: 'RU', note: 'Высокий CR, сезон Q1' },
    { name: 'Нутра EU Slim', geo: 'EU', note: 'Гео: DE, FR, IT' },
    { name: 'Crypto LATAM', geo: 'LATAM', note: 'BR + MX, языки en/es/pt' },
  ];
  offersMap.set(id, { id, userId: 'user_demo', createdAt: new Date(), ...seeds[i] });
});

export const OfferStore = {
  async findById(id) {
    return offersMap.get(id) ?? null;
  },

  async findByUserId(userId) {
    return [...offersMap.values()].filter(o => o.userId === userId);
  },

  async create({ userId, name, geo, note }) {
    const id = `offer_${randomUUID().slice(0, 8)}`;
    const offer = { id, userId, name, geo, note, createdAt: new Date() };
    offersMap.set(id, offer);
    return offer;
  },

  async delete(id) {
    return offersMap.delete(id);
  },
};

// ── CREATIVE STORE ────────────────────────────────────────────────────────────

const creativesMap = new Map();

export const CreativeStore = {
  async create(data) {
    const id = `cr_${randomUUID().slice(0, 8)}`;
    const creative = { id, createdAt: new Date(), ...data };
    creativesMap.set(id, creative);
    return creative;
  },

  async findById(id) {
    return creativesMap.get(id) ?? null;
  },

  async findByUserId(userId) {
    return [...creativesMap.values()]
      .filter(c => c.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async findByOfferId(offerId) {
    return [...creativesMap.values()].filter(c => c.offerId === offerId);
  },

  async list() {
    return [...creativesMap.values()];
  },
};

// ── PRESET STORE ──────────────────────────────────────────────────────────────

const presetsMap = new Map();

export const PresetStore = {
  async save({ userId, offerId, settings }) {
    const id = `preset_${randomUUID().slice(0, 8)}`;
    const preset = { id, userId, offerId, settings, createdAt: new Date() };
    presetsMap.set(id, preset);
    return preset;
  },

  async findByOfferId(offerId) {
    return [...presetsMap.values()].filter(p => p.offerId === offerId);
  },
};

// ── LIMITS CHECKER ─────────────────────────────────────────────────────────────

export function canProcessCreative(user, { videoDurationSec, variations, isYoutubeImport }) {
  const limits = PLAN_LIMITS[user.plan];
  if (!limits) return { allowed: false, reason: 'Неизвестный план' };

  if (user.videosProcessedThisMonth >= limits.videosPerMonth) {
    return { allowed: false, reason: `Лимит видео за месяц исчерпан (${limits.videosPerMonth} для плана ${user.plan})` };
  }

  if (videoDurationSec && videoDurationSec > limits.maxDurationSec) {
    return { allowed: false, reason: `Максимальная длина видео: ${limits.maxDurationSec}с для плана ${user.plan}` };
  }

  if (variations > limits.maxVariations) {
    return { allowed: false, reason: `Максимум ${limits.maxVariations} вариаций для плана ${user.plan}` };
  }

  if (isYoutubeImport && !limits.youtubeImport) {
    return { allowed: false, reason: `YouTube-импорт недоступен на плане ${user.plan}` };
  }

  if (isYoutubeImport && limits.youtubeImportsPerMonth && user.youtubeImportsThisMonth >= limits.youtubeImportsPerMonth) {
    return { allowed: false, reason: `Лимит YouTube-импортов за месяц исчерпан` };
  }

  return { allowed: true };
}
