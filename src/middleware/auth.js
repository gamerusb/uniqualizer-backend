// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE
// Простая идентификация через userId из заголовка/тела
// В продакшене заменить на JWT + Passport
// ─────────────────────────────────────────────────────────────────────────────

import { UserStore } from '../stores/index.js';

export async function resolveUser(req, res, next) {
  // Берём userId из заголовка или тела запроса
  const userId = req.headers['x-user-id'] || req.body?.userId || req.query?.userId || 'user_demo';

  try {
    const user = await UserStore.findOrCreate(userId);
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Ошибка авторизации' });
  }
}

export function requirePlan(...plans) {
  return (req, res, next) => {
    if (!plans.includes(req.user?.plan)) {
      return res.status(403).json({
        success: false,
        error: `Эта функция доступна на планах: ${plans.join(', ')}`,
        requiredPlan: plans[0],
      });
    }
    next();
  };
}
