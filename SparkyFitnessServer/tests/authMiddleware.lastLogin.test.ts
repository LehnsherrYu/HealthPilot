import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error supertest does not ship types in this repository
import request from 'supertest';
const { getSession, updateLastLogin } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateLastLogin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../auth.js', () => ({
  auth: { api: { getSession }, options: { advanced: {} } },
}));
vi.mock('../models/userRepository.js', () => ({
  default: {
    ensureUserInitialization: vi.fn().mockResolvedValue(undefined),
    updateUserLastLogin: updateLastLogin,
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
import { authenticate } from '../middleware/authMiddleware.js';
import { clearApiKeySessionCache } from '../utils/apiKeySessionCache.js';
const app = express();
app.use((req, _res, next) => {
  req.cookies = {};
  next();
});
app.use(authenticate);
app.get('/api/profile', (req, res) => res.json({ owner: req.userId }));
app.get('/api/v2/symptom-journal/parse', (req, res) =>
  res.json({ owner: req.userId })
);
beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-28T04:00:00.000Z'));
  vi.clearAllMocks();
  clearApiKeySessionCache();
});
afterEach(() => vi.useRealTimers());
describe.each([
  ['cookie', { Cookie: 'synthetic_session=owner' }],
  ['api-key', { 'x-api-key': 's'.repeat(64) }],
] as const)(
  'last-login throttling with %s authentication',
  (_kind, headers) => {
    it.each([
      ['recent Date', new Date('2026-09-28T03:59:59.000Z'), false],
      ['recent string', '2026-09-28T03:59:59.000Z', false],
      ['old Date', new Date('2026-09-28T02:00:00.000Z'), true],
      ['old string', '2026-09-28T02:00:00.000Z', true],
      ['hour boundary Date', new Date('2026-09-28T03:00:00.000Z'), false],
      ['hour boundary string', '2026-09-28T03:00:00.000Z', false],
      ['missing', undefined, true],
      ['null', null, true],
      ['invalid string', 'not-a-date', true],
      ['invalid Date', new Date(Number.NaN), true],
      ['numeric timestamp', 1790567999000, true],
      ['unexpected object', {}, true],
    ] as const)(
      'preserves the hourly guard for %s',
      async (_label, lastLoginAt, update) => {
        getSession.mockImplementation(async () => ({
          user: { id: 'synthetic-owner', name: 'Synthetic user', lastLoginAt },
        }));
        expect(
          (await request(app).get('/api/profile').set(headers)).status
        ).toBe(200);
        expect(updateLastLogin).toHaveBeenCalledTimes(update ? 1 : 0);
      }
    );
    it('accepts a recent legacy last_login_at value', async () => {
      getSession.mockResolvedValue({
        user: { id: 'synthetic-owner', last_login_at: new Date() },
      });
      expect((await request(app).get('/api/profile').set(headers)).status).toBe(
        200
      );
      expect(updateLastLogin).not.toHaveBeenCalled();
    });
    it('also avoids a last-login write for a recent Date on the parser path', async () => {
      getSession.mockResolvedValue({
        user: { id: 'synthetic-owner', lastLoginAt: new Date() },
      });
      expect(
        (await request(app).get('/api/v2/symptom-journal/parse').set(headers))
          .status
      ).toBe(200);
      expect(updateLastLogin).not.toHaveBeenCalled();
    });
  }
);
