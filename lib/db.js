const { Pool } = require('pg');

let pool;
let initialized = false;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is missing. Add it in Coolify environment variables.');
    }

    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

async function initDb() {
  if (initialized) return;

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL DEFAULT 'dashboard',
      channel_id TEXT,
      message_id TEXT,
      created_by_discord_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '',
      prize TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      max_participants INTEGER,
      default_region TEXT NOT NULL DEFAULT '',
      signup_closes_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL,
      discord_username TEXT NOT NULL,
      roblox_username TEXT NOT NULL,
      region TEXT NOT NULL,
      seed INTEGER,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS tournament_matches (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      player1_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
      player2_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
      player1_name TEXT NOT NULL DEFAULT '',
      player2_name TEXT NOT NULL DEFAULT '',
      score1 INTEGER,
      score2 INTEGER,
      winner_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, round_number, match_number)
    );
  `);

  await getPool().query(`
    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS rules TEXT NOT NULL DEFAULT '';

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS prize TEXT NOT NULL DEFAULT '';

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS signup_closes_at TIMESTAMPTZ;

    ALTER TABLE tournaments
    ALTER COLUMN status SET DEFAULT 'open';

    UPDATE tournaments
    SET status = CASE
      WHEN LOWER(status) IN ('running', 'ongoing') THEN 'ongoing'
      WHEN LOWER(status) IN ('completed', 'ended') THEN 'ended'
      ELSE 'open'
    END
    WHERE status IS DISTINCT FROM CASE
      WHEN LOWER(status) IN ('running', 'ongoing') THEN 'ongoing'
      WHEN LOWER(status) IN ('completed', 'ended') THEN 'ended'
      ELSE 'open'
    END;
  `);

  initialized = true;
}

async function query(text, params) {
  await initDb();
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  await initDb();
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  initDb,
  query,
  withTransaction,
};
