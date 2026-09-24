import type { PoolClient } from 'pg';
import type {
  CreateSymptomJournal,
  UpdateSymptomJournal,
  SearchSymptomJournal,
  SymptomJournalEntry,
  SymptomJournalPage,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';

type JournalRow = Omit<
  SymptomJournalEntry,
  'started_at' | 'ended_at' | 'created_at' | 'updated_at'
> & {
  started_at: Date;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type MutationResult = SymptomJournalEntry | 'missing' | 'conflict';
const columns = `id, user_id, raw_text, symptom_name, body_location, severity,
  started_at, ended_at, status, triggers, relieving_factors, notes, version, created_at, updated_at`;

function serialize(row: JournalRow): SymptomJournalEntry {
  return {
    ...row,
    started_at: row.started_at.toISOString(),
    ended_at: row.ended_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
async function withOwner<T>(
  owner: string,
  actor: string,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await getClient(owner, actor);
  try {
    return await work(client);
  } finally {
    client.release();
  }
}
function fieldValues(data: CreateSymptomJournal | UpdateSymptomJournal) {
  return [
    data.symptom_name,
    data.body_location,
    data.severity,
    data.started_at,
    data.ended_at,
    data.status,
    data.triggers,
    data.relieving_factors,
    data.notes,
  ];
}

async function create(
  owner: string,
  actor: string,
  data: CreateSymptomJournal
): Promise<SymptomJournalEntry> {
  return withOwner(owner, actor, async (client) => {
    const result = await client.query<JournalRow>(
      `INSERT INTO healthpilot_symptom_journal
      (user_id, raw_text, symptom_name, body_location, severity, started_at, ended_at, status, triggers, relieving_factors, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
      [owner, data.raw_text, ...fieldValues(data)]
    );
    return serialize(result.rows[0]!);
  });
}
async function get(
  owner: string,
  actor: string,
  id: string
): Promise<SymptomJournalEntry | null> {
  return withOwner(owner, actor, async (client) => {
    const result = await client.query<JournalRow>(
      `SELECT ${columns} FROM healthpilot_symptom_journal WHERE user_id=$1 AND id=$2`,
      [owner, id]
    );
    return result.rows[0] ? serialize(result.rows[0]) : null;
  });
}
async function search(
  owner: string,
  actor: string,
  filters: SearchSymptomJournal,
  from: Date | null,
  to: Date | null
): Promise<SymptomJournalPage> {
  return withOwner(owner, actor, async (client) => {
    // strpos treats % and _ literally; every user value remains parameterized.
    const result = await client.query<JournalRow>(
      `SELECT ${columns} FROM healthpilot_symptom_journal
      WHERE user_id=$1 AND ($2::text IS NULL OR strpos(lower(symptom_name), lower($2)) > 0)
      AND ($3::text IS NULL OR strpos(lower(COALESCE(body_location,'')), lower($3)) > 0)
      AND ($4::text IS NULL OR status=$4)
      AND ($5::timestamptz IS NULL OR started_at >= $5)
      AND ($6::timestamptz IS NULL OR started_at < $6)
      ORDER BY started_at DESC, id DESC LIMIT $7 OFFSET $8`,
      [
        owner,
        filters.symptom_name || null,
        filters.body_location || null,
        filters.status ?? null,
        from,
        to,
        filters.limit + 1,
        filters.offset,
      ]
    );
    return {
      entries: result.rows.slice(0, filters.limit).map(serialize),
      has_more: result.rows.length > filters.limit,
    };
  });
}
async function mutate(
  owner: string,
  actor: string,
  id: string,
  version: number,
  data?: UpdateSymptomJournal
): Promise<MutationResult> {
  return withOwner(owner, actor, async (client) => {
    await client.query('BEGIN');
    try {
      const existing = await client.query<JournalRow>(
        `SELECT ${columns} FROM healthpilot_symptom_journal WHERE user_id=$1 AND id=$2 FOR UPDATE`,
        [owner, id]
      );
      const row = existing.rows[0];
      let result: MutationResult;
      if (!row) result = 'missing';
      else if (row.version !== version) result = 'conflict';
      else if (data) {
        const updated = await client.query<JournalRow>(
          `UPDATE healthpilot_symptom_journal SET
          symptom_name=$3, body_location=$4, severity=$5, started_at=$6, ended_at=$7,
          status=$8, triggers=$9, relieving_factors=$10, notes=$11, version=version+1, updated_at=NOW()
          WHERE user_id=$1 AND id=$2 RETURNING ${columns}`,
          [owner, id, ...fieldValues(data)]
        );
        result = serialize(updated.rows[0]!);
      } else {
        await client.query(
          'DELETE FROM healthpilot_symptom_journal WHERE user_id=$1 AND id=$2',
          [owner, id]
        );
        result = serialize(row);
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
export default { create, get, search, mutate };
