import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest does not ship types in this repository
import request from 'supertest';
import express from 'express';
import {
  createSymptomJournalSchema,
  updateSymptomJournalSchema,
  searchSymptomJournalSchema,
} from '@workspace/shared';
import repository from '../models/symptomJournalRepository.js';
import service from '../services/symptomJournalService.js';
import routes from '../routes/v2/symptomJournalRoutes.js';
import { requestLogger } from '../middleware/requestLogger.js';
import errorHandler from '../middleware/errorHandler.js';
import { log } from '../config/logging.js';
vi.mock('../models/symptomJournalRepository.js', () => ({
  default: { create: vi.fn(), get: vi.fn(), search: vi.fn(), mutate: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
const owner = '550e8400-e29b-41d4-a716-446655440000';
const id = '550e8400-e29b-41d4-a716-446655440001';
const base = '/api/v2/symptom-journal';
const input = {
  raw_text: '  synthetic-private-original\n',
  symptom_name: 'Headache',
  body_location: null,
  severity: 0,
  started_at: '2026-03-08T10:00:00Z',
  ended_at: null,
  status: 'ongoing' as const,
  triggers: null,
  relieving_factors: null,
  notes: 'synthetic-private-notes',
};
const entry = {
  ...input,
  id,
  user_id: owner,
  version: 1,
  created_at: input.started_at,
  updated_at: input.started_at,
};
const app = express();
app.use(requestLogger({ logCompletion: true }));
app.use(express.json());
app.use((req, _res, next) => {
  if (req.headers.authorization) {
    req.userId = String(req.headers['x-target'] || owner);
    req.authenticatedUserId = owner;
  }
  next();
});
app.use(base, routes);
app.use(errorHandler);
const auth = { Authorization: 'synthetic-session' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.create).mockResolvedValue(entry);
  vi.mocked(repository.get).mockResolvedValue(entry);
  vi.mocked(repository.mutate).mockResolvedValue(entry);
  vi.mocked(repository.search).mockResolvedValue({
    entries: [entry],
    has_more: false,
  });
});

describe('journal contracts', () => {
  it('preserves original whitespace and unknown severity', () => {
    expect(
      createSymptomJournalSchema.parse({ ...input, severity: null }).raw_text
    ).toBe(input.raw_text);
  });
  it.each([
    { raw_text: '  ' },
    { raw_text: 'x'.repeat(10001) },
    { severity: 11 },
    { severity: -1 },
    { severity: 1.5 },
    { severity: '5' },
    { status: 'resolved' },
    { ended_at: input.started_at },
    { status: 'resolved', ended_at: '2026-03-08T09:59:00Z' },
    { started_at: '2026-03-08T10:00' },
    { user_id: owner },
    { shared: true },
  ])('rejects invalid event case %#', (change) => {
    expect(
      createSymptomJournalSchema.safeParse({ ...input, ...change }).success
    ).toBe(false);
  });
  it('accepts ended event and rejects original text in updates', () => {
    expect(
      createSymptomJournalSchema.safeParse({
        ...input,
        status: 'resolved',
        ended_at: input.started_at,
      }).success
    ).toBe(true);
    expect(
      updateSymptomJournalSchema.safeParse({ ...input, version: 1 }).success
    ).toBe(false);
  });
  it('rejects invalid days, reversed ranges, and excessive pages', () => {
    for (const filters of [
      { from: '2026-02-30' },
      { from: '2026-09-24', to: '2026-09-23' },
      { limit: 101 },
      { offset: -1 },
      { user_id: owner },
    ])
      expect(searchSymptomJournalSchema.safeParse(filters).success).toBe(false);
  });
});
describe('journal service and HTTP', () => {
  it('uses timezone day boundaries across DST', async () => {
    await service.search(
      owner,
      owner,
      searchSymptomJournalSchema.parse({ from: '2026-03-08', to: '2026-03-08' })
    );
    expect(repository.search).toHaveBeenCalledWith(
      owner,
      owner,
      expect.any(Object),
      new Date('2026-03-08T05:00:00Z'),
      new Date('2026-03-09T04:00:00Z')
    );
  });
  it('rejects a delegated service caller before database access', async () => {
    await expect(service.get(owner, id, id)).rejects.toMatchObject({
      status: 403,
    });
    expect(repository.get).not.toHaveBeenCalled();
  });
  it('requires auth and rejects delegated sessions/headers', async () => {
    expect((await request(app).post(base).send(input)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(base)
          .set({ ...auth, 'x-target': id })
          .send(input)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(base)
          .set({ ...auth, 'x-on-behalf-of-user-id': id })
          .send(input)
      ).status
    ).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('supports CRUD/search with explicit actor and no-store', async () => {
    const created = await request(app).post(base).set(auth).send(input);
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(repository.create).toHaveBeenCalledWith(owner, owner, input);
    expect(
      (await request(app).get(`${base}/${id}`).set(auth)).body.raw_text
    ).toBe(input.raw_text);
    expect(
      (await request(app).post(`${base}/search`).set(auth).send({})).body
        .entries
    ).toHaveLength(1);
    const { raw_text: _raw, ...fields } = input;
    expect(
      (
        await request(app)
          .put(`${base}/${id}`)
          .set(auth)
          .send({ ...fields, version: 1 })
      ).status
    ).toBe(200);
    expect(
      (await request(app).delete(`${base}/${id}?version=1`).set(auth)).status
    ).toBe(204);
  });
  it('returns not-found or version-conflict without disclosing owners', async () => {
    vi.mocked(repository.get).mockResolvedValue(null);
    expect((await request(app).get(`${base}/${id}`).set(auth)).status).toBe(
      404
    );
    vi.mocked(repository.mutate).mockResolvedValue('missing');
    expect(
      (await request(app).delete(`${base}/${id}?version=1`).set(auth)).status
    ).toBe(404);
    vi.mocked(repository.mutate).mockResolvedValue('conflict');
    expect(
      (await request(app).delete(`${base}/${id}?version=1`).set(auth)).status
    ).toBe(409);
  });
  it('rejects filters in URLs, invalid ids and forged fields', async () => {
    expect(
      (
        await request(app)
          .post(`${base}/search?notes=private-filter`)
          .set(auth)
          .send({})
      ).status
    ).toBe(400);
    expect(
      (await request(app).get(`${base}/private-text`).set(auth)).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(base)
          .set(auth)
          .send({ ...input, user_id: id })
      ).status
    ).toBe(400);
  });
  it('redacts paths, filters, payloads, parser and database errors', async () => {
    const secret = 'PRIVATE_SENTINEL';
    await request(app)
      .post(`${base}/search?q=${secret}`)
      .set(auth)
      .send({ symptom_name: secret });
    await request(app).get(`${base}/${secret}`).set(auth);
    await request(app)
      .post(base)
      .set(auth)
      .send({
        ...input,
        raw_text: secret,
        method: secret,
        params: { name: secret },
      });
    const malformed = await request(app)
      .post(base)
      .set(auth)
      .set('Content-Type', 'application/json')
      .send(`{"raw_text":"${secret}`);
    expect(malformed.status).toBe(400);
    expect(JSON.stringify(malformed.body)).not.toContain(secret);
    vi.mocked(repository.create).mockRejectedValue(
      new Error(`SQL error ${secret}`)
    );
    const failed = await request(app).post(base).set(auth).send(input);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain(
      'synthetic-private'
    );
  });
});
