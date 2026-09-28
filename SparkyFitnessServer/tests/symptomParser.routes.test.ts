import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest does not ship types in this repository
import request from 'supertest';
import express from 'express';
import { symptomParsePreviewSchema } from '@workspace/shared';
import routes from '../routes/v2/symptomJournalRoutes.js';
import service from '../services/symptomJournalService.js';
import repository from '../models/symptomJournalRepository.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requestLogger } from '../middleware/requestLogger.js';
import errorHandler from '../middleware/errorHandler.js';
import { auth } from '../auth.js';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { log } from '../config/logging.js';
import { clearApiKeySessionCache } from '../utils/apiKeySessionCache.js';

vi.mock('../auth.js', () => ({
  auth: {
    api: { getSession: vi.fn() },
    options: {
      advanced: { cookiePrefix: 'synthetic' },
      secret: 'synthetic-test-only',
    },
  },
}));
vi.mock('../models/userRepository.js', () => ({
  default: {
    ensureUserInitialization: vi.fn().mockResolvedValue(undefined),
    updateUserLastLogin: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  getUserPreferences: vi.fn(),
}));
vi.mock('../models/symptomJournalRepository.js', () => ({
  default: { create: vi.fn(), get: vi.fn(), search: vi.fn(), mutate: vi.fn() },
}));
vi.mock('../utils/permissionUtils.js', () => ({ canAccessUserData: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
const owner = '550e8400-e29b-41d4-a716-446655440000';
const other = '550e8400-e29b-41d4-a716-446655440001';
const key = 's'.repeat(64);
const sentinel = 'SYNTHETIC_HP1B_PRIVATE';
const base = '/api/v2/symptom-journal';
const input = {
  raw_text: `  ${sentinel}\nHeadache started yesterday at 3 pm, intensity 4/10. 🧪`,
  locale: 'en',
};
const app = express();
app.use(requestLogger({ logCompletion: true }));
app.use(express.json({ limit: '64kb' }));
app.use((req, _res, next) => {
  req.cookies = Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const [name, ...value] = part.trim().split('=');
        return [name, value.join('=')];
      })
  );
  next();
});
app.use(authenticate);
app.use(base, routes);
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);
const cookie = { Cookie: 'synthetic_session=owner' };
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearApiKeySessionCache();
  vi.mocked(getUserPreferences).mockResolvedValue({
    timezone: 'Asia/Shanghai',
  });
  vi.mocked(canAccessUserData).mockResolvedValue(false);
  vi.mocked(auth.api.getSession).mockImplementation(async (request) => {
    const headers = request?.headers as Record<string, string | undefined>;
    const authenticated =
      headers.cookie?.includes('synthetic_session=') ||
      headers['x-api-key'] === key;
    if (!authenticated) return null;
    const id = headers.cookie?.includes('synthetic_session=other')
      ? other
      : owner;
    return {
      user: {
        id,
        name: 'Synthetic parser account',
        role: 'admin',
        lastLoginAt: new Date().toISOString(),
      },
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>;
  });
});
describe('parser route with real authentication middleware', () => {
  it('requires authentication', async () =>
    expect((await request(app).post(`${base}/parse`).send(input)).status).toBe(
      401
    ));
  it.each([cookie, { 'x-api-key': key }, { Authorization: `Bearer ${key}` }])(
    'accepts cookie or API key self context case %# without journal writes',
    async (headers) => {
      const response = await request(app)
        .post(`${base}/parse`)
        .set(headers)
        .send(input);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(symptomParsePreviewSchema.safeParse(response.body).success).toBe(
        true
      );
      expect(response.body.raw_text).toBe(input.raw_text);
      expect(getUserPreferences).toHaveBeenCalledWith(owner);
      for (const method of Object.values(repository))
        expect(method).not.toHaveBeenCalled();
    }
  );
  it('another account uses only its own timezone context', async () => {
    expect(
      (
        await request(app)
          .post(`${base}/parse`)
          .set('Cookie', 'synthetic_session=other')
          .send(input)
      ).status
    ).toBe(200);
    expect(getUserPreferences).toHaveBeenCalledWith(other);
    expect(getUserPreferences).not.toHaveBeenCalledWith(owner);
  });
  it.each(['reports', 'diary', 'checkin', 'medications'])(
    'blocks %s delegation even for an administrator',
    async (permission) => {
      vi.mocked(canAccessUserData).mockImplementation(
        async (_target, requested) => requested === permission
      );
      const response = await request(app)
        .post(`${base}/parse`)
        .set(
          'Cookie',
          `synthetic_session=owner; sparky_active_user_id=${other}`
        )
        .send(input);
      expect(response.status).toBe(403);
      expect(getUserPreferences).not.toHaveBeenCalled();
    }
  );
  it('rejects denied switching and on-behalf-of for both cookie and API key', async () => {
    for (const headers of [cookie, { 'x-api-key': key }]) {
      expect(
        (
          await request(app)
            .post(`${base}/parse`)
            .set({ ...headers, 'x-on-behalf-of-user-id': other })
            .send(input)
        ).status
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`${base}/parse`)
            .set({
              ...headers,
              Cookie: `synthetic_session=owner; sparky_active_user_id=${other}`,
            })
            .send(input)
        ).status
      ).toBe(403);
    }
    expect(getUserPreferences).not.toHaveBeenCalled();
  });
  it('rejects forged ownership, timezone, record ids and URL filters', async () => {
    for (const extra of [
      { owner_id: other },
      { user_id: other },
      { id: other },
      { timezone: 'UTC' },
      { reference_time: '2026-01-01T00:00:00Z' },
    ])
      expect(
        (
          await request(app)
            .post(`${base}/parse`)
            .set(cookie)
            .send({ ...input, ...extra })
        ).status
      ).toBe(400);
    expect(
      (
        await request(app)
          .post(`${base}/parse?raw_text=${sentinel}`)
          .set(cookie)
          .send(input)
      ).status
    ).toBe(400);
    expect(getUserPreferences).not.toHaveBeenCalled();
  });
  it.each([null, { timezone: null }, { timezone: 'not-a-zone' }])(
    'does not present missing or invalid timezone as confirmed UTC case %#',
    async (preference) => {
      vi.mocked(getUserPreferences).mockResolvedValue(preference);
      const response = await request(app)
        .post(`${base}/parse`)
        .set(cookie)
        .send(input);
      expect(response.status).toBe(200);
      expect(response.body.timezone).toBeNull();
      expect(response.body.timezone_source).toBe('unconfirmed');
      expect(response.body.suggestions.started_at?.value).toBeUndefined();
    }
  );
  it('does not leak preference lookup errors or fallback UTC', async () => {
    vi.mocked(getUserPreferences).mockRejectedValue(new Error(sentinel));
    const response = await request(app)
      .post(`${base}/parse`)
      .set(cookie)
      .send(input);
    expect(response.status).toBe(200);
    expect(response.body.timezone).toBeNull();
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain(sentinel);
  });
  it('rejects service delegation before accessing preferences', async () => {
    await expect(
      service.parse(owner, other, { ...input, locale: 'en' })
    ).rejects.toMatchObject({ status: 403 });
    expect(getUserPreferences).not.toHaveBeenCalled();
  });
  it('returns fixed safe errors for malformed JSON, schemas, oversized inputs and service failures', async () => {
    const malformed = await request(app)
      .post(`${base}/parse`)
      .set(cookie)
      .set('Content-Type', 'application/json')
      .send(`{"raw_text":"${sentinel}`);
    expect(malformed.status).toBe(400);
    expect(JSON.stringify(malformed.body)).not.toContain(sentinel);
    expect(
      (
        await request(app)
          .post(`${base}/parse`)
          .set(cookie)
          .send({ ...input, raw_text: sentinel.repeat(600) })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`${base}/parse`)
          .set(cookie)
          .send({ ...input, raw_text: sentinel.repeat(5000) })
      ).status
    ).toBe(413);
    vi.spyOn(service, 'parse').mockRejectedValue(new Error(sentinel));
    const failed = await request(app)
      .post(`${base}/parse`)
      .set(cookie)
      .send(input);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain(sentinel);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain(sentinel);
  });
  it('redacts DEBUG auth failures, unknown paths, encoded paths and sensitive query parameters', async () => {
    for (const path of [
      `${base}/${sentinel}`,
      `${base}/parse/${sentinel}`,
      `${base}X/${sentinel}`,
      `/api/v2/%73ymptom-journal/${sentinel}`,
      `${base}/parse?filter=${sentinel}`,
    ])
      await request(app).post(path).set(cookie).send(input);
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error(sentinel));
    const failed = await request(app)
      .post(`${base}/parse`)
      .set(cookie)
      .send(input);
    expect(failed.status).toBe(401);
    expect(JSON.stringify(failed.body)).not.toContain(sentinel);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain(sentinel);
  });
});
