import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getClient, getSystemClient, endPool } from '../db/poolManager.js';
import repository from '../models/symptomJournalRepository.js';
import { searchSymptomJournalSchema } from '@workspace/shared';

const run = process.env.RUN_SYMPTOM_JOURNAL_DB === '1';
if (
  run &&
  !/^(healthpilot_.*_test|sparky_test)$/.test(
    process.env.SPARKY_FITNESS_DB_NAME ?? ''
  )
)
  throw new Error(
    'Journal integration tests require an isolated healthpilot_*_test or CI sparky_test database.'
  );
const owner = randomUUID();
const other = randomUUID();
const delegate = randomUUID();
const input = {
  raw_text: '  Synthetic journal only\n',
  symptom_name: 'test % headache',
  body_location: 'head',
  severity: null,
  started_at: '2026-03-08T05:00:00Z',
  ended_at: null,
  status: 'ongoing' as const,
  triggers: null,
  relieving_factors: null,
  notes: null,
};
let entryId = '';
describe.runIf(run)('real PostgreSQL private journal', () => {
  beforeAll(async () => {
    const client: PoolClient = await getSystemClient();
    try {
      for (const id of [owner, other, delegate])
        await client.query(
          'INSERT INTO public."user" (id,email,email_verified) VALUES ($1,$2,true)',
          [id, `journal-${id}@example.test`]
        );
      await client.query(
        'INSERT INTO family_access (owner_user_id,family_user_id,family_email,access_permissions,is_active,status) VALUES ($1,$2,$3,$4,true,$5)',
        [
          owner,
          delegate,
          `journal-${delegate}@example.test`,
          JSON.stringify({
            can_manage_diary: true,
            can_manage_checkin: true,
            can_manage_medications: true,
            can_view_reports: true,
          }),
          'active',
        ]
      );
    } finally {
      client.release();
    }
    entryId = (await repository.create(owner, owner, input)).id;
  });
  afterAll(async () => {
    const client: PoolClient = await getSystemClient();
    try {
      await client.query('DELETE FROM public."user" WHERE id=ANY($1::uuid[])', [
        [owner, other, delegate],
      ]);
    } finally {
      client.release();
      await endPool();
    }
  });
  it('has RLS and FORCE RLS enabled', async () => {
    const client: PoolClient = await getClient(owner, owner);
    try {
      const result = await client.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='healthpilot_symptom_journal'::regclass"
      );
      expect(result.rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    } finally {
      client.release();
    }
  });
  it('owner CRUD preserves original text and catches stale versions', async () => {
    const first = await repository.get(owner, owner, entryId);
    expect(first?.raw_text).toBe(input.raw_text);
    const { raw_text: _raw, ...fields } = input;
    const update = {
      ...fields,
      status: 'resolved' as const,
      ended_at: '2026-03-08T06:00:00Z',
      version: 1,
    };
    const result = await repository.mutate(owner, owner, entryId, 1, update);
    expect(result).toMatchObject({
      version: 2,
      raw_text: input.raw_text,
      status: 'resolved',
    });
    expect(await repository.mutate(owner, owner, entryId, 1, update)).toBe(
      'conflict'
    );
    expect(await repository.mutate(owner, owner, entryId, 1)).toBe('conflict');
  });
  it.each([
    ['other', other],
    ['family delegate', delegate],
  ])(
    'blocks %s even with the target context set to the owner',
    async (_label, actor) => {
      expect(await repository.get(owner, actor, entryId)).toBeNull();
      expect(
        (
          await repository.search(
            owner,
            actor,
            searchSymptomJournalSchema.parse({}),
            null,
            null
          )
        ).entries
      ).toEqual([]);
      expect(await repository.mutate(owner, actor, entryId, 2)).toBe('missing');
      await expect(
        repository.create(owner, actor, input)
      ).rejects.toMatchObject({ code: '42501' });
      const client: PoolClient = await getClient(owner, actor);
      try {
        expect(
          (
            await client.query(
              'UPDATE healthpilot_symptom_journal SET notes=$1 WHERE id=$2',
              ['synthetic attack', entryId]
            )
          ).rowCount
        ).toBe(0);
      } finally {
        client.release();
      }
    }
  );
  it('database rejects invalid timing, severity and owner reassignment', async () => {
    const client: PoolClient = await getClient(owner, owner);
    try {
      await expect(
        client.query(
          'UPDATE healthpilot_symptom_journal SET ended_at=NULL WHERE id=$1',
          [entryId]
        )
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          'UPDATE healthpilot_symptom_journal SET severity=11 WHERE id=$1',
          [entryId]
        )
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          'UPDATE healthpilot_symptom_journal SET user_id=$1 WHERE id=$2',
          [other, entryId]
        )
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      client.release();
    }
  });
  it('searches literally, paginates deterministically, and excludes upper time bound', async () => {
    const second = await repository.create(owner, owner, {
      ...input,
      symptom_name: 'unrelated',
      started_at: '2026-03-09T04:00:00Z',
    });
    expect(
      (
        await repository.search(
          owner,
          owner,
          searchSymptomJournalSchema.parse({ symptom_name: '%' }),
          null,
          null
        )
      ).entries.map((e) => e.id)
    ).toEqual([entryId]);
    const page = await repository.search(
      owner,
      owner,
      searchSymptomJournalSchema.parse({ limit: 1 }),
      null,
      null
    );
    expect(page.has_more).toBe(true);
    expect(page.entries[0]?.id).toBe(second.id);
    const bounded = await repository.search(
      owner,
      owner,
      searchSymptomJournalSchema.parse({}),
      new Date(input.started_at),
      new Date('2026-03-09T04:00:00Z')
    );
    expect(bounded.entries.map((e) => e.id)).toEqual([entryId]);
    expect(await repository.mutate(owner, owner, second.id, 1)).toMatchObject({
      id: second.id,
    });
    expect(await repository.get(owner, owner, second.id)).toBeNull();
  });
});
