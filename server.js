require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { initDb, query, withTransaction } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Poep123@@';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-before-hosting';
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Europe/Amsterdam';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    res.redirect('/login');
    return;
  }

  next();
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanToken(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function cleanMultiline(value, max = 2000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = parseDatetimeLocalInTimeZone(value, APP_TIME_ZONE);
  return Number.isNaN(date.getTime()) ? null : date;
}

function datetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDatetimeLocalInTimeZone(date, APP_TIME_ZONE);
}

function formatDatetimeLocalInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
      return values;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function timeZoneOffsetMs(timeZone, date) {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timeZoneName || '');

  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * ((hours * 60 + minutes) * 60000);
}

function parseDatetimeLocalInTimeZone(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));

  if (!match) {
    return new Date(value);
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = timeZoneOffsetMs(timeZone, new Date(localAsUtc));
  let utc = localAsUtc - offset;
  const correctedOffset = timeZoneOffsetMs(timeZone, new Date(utc));

  if (correctedOffset !== offset) {
    offset = correctedOffset;
    utc = localAsUtc - offset;
  }

  return new Date(utc);
}

function participantLabel(participant) {
  if (!participant) return '';
  const roblox = robloxAccountLabel(participant.roblox_username, participant.roblox_display_name);
  const discord = participant.discord_username || '';
  if (discord && roblox) return `${discord} (${roblox})`;
  return discord || roblox;
}

function shortParticipantLabel(participant) {
  if (!participant) return '';
  return participant.discord_username || participant.roblox_display_name || participant.roblox_username || '';
}

function robloxAccountLabel(username, displayName) {
  const robloxUsername = String(username || '').trim();
  const robloxDisplayName = String(displayName || '').trim();

  if (
    robloxDisplayName &&
    robloxUsername &&
    robloxDisplayName.toLowerCase() !== robloxUsername.toLowerCase()
  ) {
    return `${robloxDisplayName} (@${robloxUsername})`;
  }

  return robloxDisplayName || (robloxUsername ? `@${robloxUsername}` : '');
}

function accountTitle({ discordUsername, robloxUsername, robloxDisplayName, fallbackName }) {
  const parts = [];
  const discord = String(discordUsername || '').trim();
  const roblox = robloxAccountLabel(robloxUsername, robloxDisplayName);

  if (discord) parts.push(`Discord username: ${discord}`);
  if (roblox) parts.push(`Roblox display name: ${roblox}`);
  if (!parts.length && fallbackName) parts.push(fallbackName);

  return parts.join(' | ');
}

function createPublicToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function absoluteUrl(req, pathname) {
  return `${req.protocol}://${req.get('host')}${pathname}`;
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function buildSeedPositions(size) {
  if (size <= 1) return [1];
  const previous = buildSeedPositions(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

function sortParticipantsForSeeding(participants) {
  return [...participants].sort((a, b) => {
    const seedA = a.seed || 999999;
    const seedB = b.seed || 999999;
    if (seedA !== seedB) return seedA - seedB;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime() || a.id - b.id;
  });
}

function makeSeededSlots(participants) {
  const size = nextPowerOfTwo(participants.length);
  const sorted = sortParticipantsForSeeding(participants);
  const seedPositions = buildSeedPositions(size);

  return seedPositions.map((seed) => sorted[seed - 1] || null);
}

function roundLabel(roundNumber, finalRound) {
  if (roundNumber === finalRound) return 'Final';
  if (roundNumber === finalRound - 1) return 'Semi finals';
  if (roundNumber === finalRound - 2) return 'Quarter finals';
  return `Round ${roundNumber}`;
}

function matchTitle(match, finalRound) {
  if (match.round_number === finalRound) return 'Final';
  if (match.round_number === finalRound - 1) return `Semi final ${match.match_number}`;
  if (match.round_number === finalRound - 2) return `Quarter final ${match.match_number}`;
  return `Round ${match.round_number} match ${match.match_number}`;
}

function normalizeTournamentStatus(status) {
  const value = cleanText(status, 30).toLowerCase();

  if (['closed', 'running', 'ongoing'].includes(value)) return 'ongoing';
  if (['completed', 'cancelled', 'ended'].includes(value)) return 'ended';
  return 'open';
}

function displayTournamentStatus(status) {
  const labels = {
    open: 'Open',
    ongoing: 'Ongoing',
    ended: 'Ended',
  };
  return labels[normalizeTournamentStatus(status)];
}

async function loadTournament(id) {
  const result = await query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function loadTournamentByPublicToken(token) {
  const result = await query('SELECT * FROM tournaments WHERE public_token = $1', [token]);
  return result.rows[0] || null;
}

async function ensureTournamentPublicToken(tournament) {
  if (tournament.public_token) return tournament.public_token;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = createPublicToken();

    try {
      const result = await query(
        `UPDATE tournaments
         SET public_token = $1, updated_at = NOW()
         WHERE id = $2 AND public_token IS NULL
         RETURNING public_token`,
        [token, tournament.id],
      );

      if (!result.rows[0]) {
        const current = await loadTournament(tournament.id);
        tournament.public_token = current?.public_token || '';
        if (tournament.public_token) return tournament.public_token;
        continue;
      }

      tournament.public_token = result.rows[0].public_token;
      return tournament.public_token;
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }

  throw new Error('Could not create a unique live bracket link.');
}

async function touchTournament(tournamentId) {
  await query('UPDATE tournaments SET updated_at = NOW() WHERE id = $1', [tournamentId]);
  await notifyTournamentUpdated(tournamentId);
}

async function notifyTournamentUpdated(tournamentId) {
  if (!tournamentId) return;
  await query("SELECT pg_notify('tournament_updated', $1)", [String(tournamentId)]);
}

function wantsJson(req) {
  return req.xhr || String(req.get('accept') || '').includes('application/json');
}

async function loadParticipants(tournamentId) {
  const result = await query(
    `SELECT * FROM tournament_participants
     WHERE tournament_id = $1
     ORDER BY COALESCE(seed, 999999), joined_at ASC, id ASC`,
    [tournamentId],
  );
  return result.rows;
}

async function loadMatches(tournamentId) {
  const result = await query(
    `SELECT m.*,
       p1.roblox_username AS p1_roblox, p1.roblox_display_name AS p1_roblox_display, p1.discord_username AS p1_discord, p1.seed AS p1_seed,
       p2.roblox_username AS p2_roblox, p2.roblox_display_name AS p2_roblox_display, p2.discord_username AS p2_discord, p2.seed AS p2_seed,
       w.roblox_username AS winner_roblox, w.roblox_display_name AS winner_roblox_display, w.discord_username AS winner_discord, w.seed AS winner_seed
     FROM tournament_matches m
     LEFT JOIN tournament_participants p1 ON p1.id = m.player1_participant_id
     LEFT JOIN tournament_participants p2 ON p2.id = m.player2_participant_id
     LEFT JOIN tournament_participants w ON w.id = m.winner_participant_id
     WHERE m.tournament_id = $1
     ORDER BY m.round_number ASC, m.match_number ASC`,
    [tournamentId],
  );

  return result.rows.map((match) => ({
    ...match,
    player1_label: accountTitle({
      discordUsername: match.p1_discord,
      robloxUsername: match.p1_roblox,
      robloxDisplayName: match.p1_roblox_display,
      fallbackName: match.player1_name,
    }),
    player2_label: accountTitle({
      discordUsername: match.p2_discord,
      robloxUsername: match.p2_roblox,
      robloxDisplayName: match.p2_roblox_display,
      fallbackName: match.player2_name,
    }),
    player1_short: match.p1_discord || match.player1_name || 'TBD',
    player2_short: match.p2_discord || match.player2_name || 'TBD',
    player1_roblox_label: robloxAccountLabel(match.p1_roblox, match.p1_roblox_display),
    player2_roblox_label: robloxAccountLabel(match.p2_roblox, match.p2_roblox_display),
    winner_label: match.winner_discord || match.winner_roblox || match.winner_roblox_display
      ? participantLabel({
          discord_username: match.winner_discord,
          roblox_username: match.winner_roblox,
          roblox_display_name: match.winner_roblox_display,
        })
      : '',
  }));
}

async function getParticipant(client, participantId) {
  if (!participantId) return null;
  const result = await client.query(
    'SELECT * FROM tournament_participants WHERE id = $1',
    [participantId],
  );
  return result.rows[0] || null;
}

async function clearDownstreamSlot(client, tournamentId, match) {
  if (!match) return;

  const nextRound = match.round_number + 1;
  const nextMatchNumber = Math.ceil(match.match_number / 2);
  const targetColumn = match.match_number % 2 === 1 ? 'player1_participant_id' : 'player2_participant_id';
  const targetNameColumn = match.match_number % 2 === 1 ? 'player1_name' : 'player2_name';

  const nextMatchResult = await client.query(
    `SELECT * FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND match_number = $3`,
    [tournamentId, nextRound, nextMatchNumber],
  );

  const nextMatch = nextMatchResult.rows[0];
  if (!nextMatch) return;

  await client.query(
    `UPDATE tournament_matches
     SET ${targetColumn} = NULL,
         ${targetNameColumn} = '',
         score1 = NULL,
         score2 = NULL,
         winner_participant_id = NULL,
         status = 'pending',
         updated_at = NOW()
     WHERE id = $1`,
    [nextMatch.id],
  );

  await clearDownstreamSlot(client, tournamentId, nextMatch);
}

async function propagateWinner(client, tournamentId, match) {
  if (!match.winner_participant_id) return;

  const nextRound = match.round_number + 1;
  const nextMatchNumber = Math.ceil(match.match_number / 2);
  const targetColumn = match.match_number % 2 === 1 ? 'player1_participant_id' : 'player2_participant_id';
  const targetNameColumn = match.match_number % 2 === 1 ? 'player1_name' : 'player2_name';
  const participant = await getParticipant(client, match.winner_participant_id);
  const name = participant ? participantLabel(participant) : '';

  await client.query(
    `UPDATE tournament_matches
     SET ${targetColumn} = $1,
         ${targetNameColumn} = $2,
         updated_at = NOW()
     WHERE tournament_id = $3 AND round_number = $4 AND match_number = $5`,
    [match.winner_participant_id, name, tournamentId, nextRound, nextMatchNumber],
  );
}

async function loadSourceMatchForSlot(client, tournamentId, match, slot) {
  if (!match || match.round_number <= 1) return null;

  const sourceMatchNumber = match.match_number * 2 - (slot === 'p1' ? 1 : 0);
  const result = await client.query(
    `SELECT * FROM tournament_matches
     WHERE tournament_id = $1 AND round_number = $2 AND match_number = $3`,
    [tournamentId, match.round_number - 1, sourceMatchNumber],
  );
  return result.rows[0] || null;
}

async function missingSlotWaitsForSource(client, tournamentId, match, missingSlot) {
  const sourceMatch = await loadSourceMatchForSlot(client, tournamentId, match, missingSlot);
  return Boolean(sourceMatch && !sourceMatch.winner_participant_id);
}

async function autoAdvanceByes(client, tournamentId) {
  let changed = true;

  while (changed) {
    changed = false;
    const result = await client.query(
      `SELECT * FROM tournament_matches
       WHERE tournament_id = $1
         AND winner_participant_id IS NULL
         AND ((player1_participant_id IS NOT NULL AND player2_participant_id IS NULL)
           OR (player1_participant_id IS NULL AND player2_participant_id IS NOT NULL))
       ORDER BY round_number ASC, match_number ASC`,
      [tournamentId],
    );

    for (const match of result.rows) {
      const missingSlot = match.player1_participant_id ? 'p2' : 'p1';
      const waitsForSource = await missingSlotWaitsForSource(client, tournamentId, match, missingSlot);

      if (waitsForSource) {
        continue;
      }

      const winnerId = match.player1_participant_id || match.player2_participant_id;
      const updateResult = await client.query(
        `UPDATE tournament_matches
         SET winner_participant_id = $1, status = 'completed', updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [winnerId, match.id],
      );
      await propagateWinner(client, tournamentId, updateResult.rows[0]);
      changed = true;
    }
  }
}

async function repairPrematureAutoAdvances(client, tournamentId) {
  let changed = true;
  let repaired = false;

  const statusResult = await client.query(
    `UPDATE tournament_matches
     SET status = CASE
           WHEN player1_participant_id IS NOT NULL AND player2_participant_id IS NOT NULL THEN 'running'
           ELSE 'pending'
         END,
         updated_at = NOW()
     WHERE tournament_id = $1
       AND winner_participant_id IS NULL
       AND status = 'completed'
     RETURNING id`,
    [tournamentId],
  );

  if (statusResult.rowCount > 0) {
    repaired = true;
  }

  while (changed) {
    changed = false;
    const result = await client.query(
      `SELECT * FROM tournament_matches
       WHERE tournament_id = $1
         AND round_number > 1
         AND winner_participant_id IS NOT NULL
         AND ((player1_participant_id IS NOT NULL AND player2_participant_id IS NULL)
           OR (player1_participant_id IS NULL AND player2_participant_id IS NOT NULL))
       ORDER BY round_number ASC, match_number ASC`,
      [tournamentId],
    );

    for (const match of result.rows) {
      const missingSlot = match.player1_participant_id ? 'p2' : 'p1';
      const waitsForSource = await missingSlotWaitsForSource(client, tournamentId, match, missingSlot);

      if (!waitsForSource) {
        continue;
      }

      await client.query(
        `UPDATE tournament_matches
         SET score1 = NULL,
             score2 = NULL,
             winner_participant_id = NULL,
             status = 'pending',
             updated_at = NOW()
         WHERE id = $1`,
        [match.id],
      );
      await clearDownstreamSlot(client, tournamentId, match);
      changed = true;
      repaired = true;
    }
  }

  return repaired;
}

async function syncTournamentStatus(client, tournamentId) {
  const finalResult = await client.query(
    `SELECT * FROM tournament_matches
     WHERE tournament_id = $1
     ORDER BY round_number DESC, match_number ASC
     LIMIT 1`,
    [tournamentId],
  );

  const finalMatch = finalResult.rows[0];
  if (!finalMatch) return;

  if (finalMatch.winner_participant_id) {
    await client.query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [
      'ended',
      tournamentId,
    ]);
    return;
  }

  await client.query(
    `UPDATE tournaments
     SET status = CASE WHEN status IN ('completed', 'ended') THEN 'ongoing' ELSE status END,
         updated_at = NOW()
     WHERE id = $1`,
    [tournamentId],
  );
}

async function regenerateBracket(tournamentId, status = null) {
  const participants = await loadParticipants(tournamentId);

  if (participants.length < 2) {
    throw new Error('You need at least 2 participants to generate a bracket.');
  }

  const size = nextPowerOfTwo(participants.length);
  const rounds = Math.log2(size);
  const slots = makeSeededSlots(participants);

  await withTransaction(async (client) => {
    await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tournamentId]);

    for (let round = 1; round <= rounds; round += 1) {
      const matchesInRound = size / Math.pow(2, round);

      for (let matchNumber = 1; matchNumber <= matchesInRound; matchNumber += 1) {
        let p1 = null;
        let p2 = null;

        if (round === 1) {
          p1 = slots[(matchNumber - 1) * 2] || null;
          p2 = slots[(matchNumber - 1) * 2 + 1] || null;
        }

        await client.query(
          `INSERT INTO tournament_matches
            (tournament_id, round_number, match_number,
             player1_participant_id, player2_participant_id, player1_name, player2_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tournamentId,
            round,
            matchNumber,
            p1?.id || null,
            p2?.id || null,
            p1 ? participantLabel(p1) : '',
            p2 ? participantLabel(p2) : '',
          ],
        );
      }
    }

    await autoAdvanceByes(client, tournamentId);
    await repairPrematureAutoAdvances(client, tournamentId);

    if (status) {
      await client.query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [
        status,
        tournamentId,
      ]);
    }

    await syncTournamentStatus(client, tournamentId);
  });
}

async function countMatches(tournamentId) {
  const result = await query(
    'SELECT COUNT(*)::int AS match_count FROM tournament_matches WHERE tournament_id = $1',
    [tournamentId],
  );
  return result.rows[0]?.match_count || 0;
}

async function resetBracketResults(tournamentId) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE tournament_matches
       SET score1 = NULL,
           score2 = NULL,
           winner_participant_id = NULL,
           status = 'pending',
           player1_participant_id = CASE WHEN round_number = 1 THEN player1_participant_id ELSE NULL END,
           player2_participant_id = CASE WHEN round_number = 1 THEN player2_participant_id ELSE NULL END,
           player1_name = CASE WHEN round_number = 1 THEN player1_name ELSE '' END,
           player2_name = CASE WHEN round_number = 1 THEN player2_name ELSE '' END,
           updated_at = NOW()
       WHERE tournament_id = $1`,
      [tournamentId],
    );

    await autoAdvanceByes(client, tournamentId);
    await repairPrematureAutoAdvances(client, tournamentId);
    await client.query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [
      'ongoing',
      tournamentId,
    ]);
  });
}

async function buildTournamentViewData(tournament) {
  const participants = await loadParticipants(tournament.id);
  let matches = await loadMatches(tournament.id);

  if (matches.length) {
    let repaired = false;
    await withTransaction(async (client) => {
      repaired = await repairPrematureAutoAdvances(client, tournament.id);
      if (repaired) {
        await syncTournamentStatus(client, tournament.id);
      }
    });

    if (repaired) {
      await notifyTournamentUpdated(tournament.id);
      matches = await loadMatches(tournament.id);
    }
  }

  const rounds = matches.reduce((groups, match) => {
    if (!groups[match.round_number]) groups[match.round_number] = [];
    groups[match.round_number].push(match);
    return groups;
  }, {});
  const completedMatches = matches.filter((match) => match.status === 'completed').length;
  const readyMatches = matches.filter(
    (match) => match.player1_participant_id && match.player2_participant_id && !match.winner_participant_id,
  ).length;
  const finalRound = matches.reduce((max, match) => Math.max(max, match.round_number), 0);
  const championMatch = matches.find(
    (match) => match.round_number === finalRound && match.winner_participant_id,
  );

  return {
    tournament,
    participants,
    matches,
    rounds,
    stats: {
      completedMatches,
      readyMatches,
      totalMatches: matches.length,
      progress: matches.length ? Math.round((completedMatches / matches.length) * 100) : 0,
      champion: championMatch?.winner_label || '',
    },
    roundLabel,
    matchTitle,
    normalizeTournamentStatus,
    displayTournamentStatus,
    datetimeLocalValue,
  };
}

app.get('/login', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
    return;
  }

  res.render('login');
});

app.post('/login', (req, res) => {
  const userOk = timingSafeEqualString(req.body.username || '', ADMIN_USER);
  const passwordOk = timingSafeEqualString(req.body.password || '', ADMIN_PASSWORD);

  if (!userOk || !passwordOk) {
    flash(req, 'error', 'Wrong username or password.');
    res.redirect('/login');
    return;
  }

  req.session.user = { username: ADMIN_USER };
  res.redirect('/dashboard');
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

app.get('/brackets/:token', async (req, res, next) => {
  try {
    const token = cleanToken(req.params.token);
    const tournament = token ? await loadTournamentByPublicToken(token) : null;

    if (!tournament) {
      res.status(404).send('Live bracket not found.');
      return;
    }

    const viewData = await buildTournamentViewData(tournament);

    if (req.query.partial === '1') {
      res.render('partials/bracket-board', { ...viewData, readOnly: true });
      return;
    }

    res.render('bracket-live', viewData);
  } catch (error) {
    next(error);
  }
});

app.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.*,
        COUNT(DISTINCT p.id)::int AS participant_count,
        COUNT(DISTINCT m.id)::int AS match_count,
        COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END)::int AS completed_match_count
       FROM tournaments t
       LEFT JOIN tournament_participants p ON p.tournament_id = t.id
       LEFT JOIN tournament_matches m ON m.tournament_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
    );

    res.render('dashboard', { tournaments: result.rows, displayTournamentStatus });
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100) || 'Untitled Tournament';
    const description = cleanMultiline(req.body.description, 1000);
    const rules = cleanMultiline(req.body.rules, 1000);
    const prize = cleanMultiline(req.body.prize, 500);
    const maxParticipants = toInt(req.body.max_participants);
    const defaultRegion = cleanText(req.body.default_region, 50);
    const signupClosesAt = toDateOrNull(req.body.signup_closes_at);
    const publicToken = createPublicToken();

    const result = await query(
      `INSERT INTO tournaments
        (guild_id, name, description, rules, prize, status, public_token, max_participants, default_region, signup_closes_at)
       VALUES ('dashboard', $1, $2, $3, $4, 'open', $5, $6, $7, $8)
       RETURNING id`,
      [name, description, rules, prize, publicToken, maxParticipants, defaultRegion, signupClosesAt],
    );

    flash(req, 'success', 'Tournament created. Add players, seed them, then start the bracket.');
    res.redirect(`/tournaments/${result.rows[0].id}`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    const tournament = await loadTournament(tournamentId);

    if (!tournament) {
      res.status(404).send('Tournament not found.');
      return;
    }

    await query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
    await notifyTournamentUpdated(tournamentId);
    flash(req, 'success', `Tournament "${tournament.name}" deleted.`);
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

app.get('/tournaments/:id', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    const tournament = await loadTournament(tournamentId);

    if (!tournament) {
      res.status(404).send('Tournament not found.');
      return;
    }

    const publicToken = await ensureTournamentPublicToken(tournament);
    const viewData = await buildTournamentViewData(tournament);

    if (req.query.partial === '1') {
      res.render('partials/bracket-board', { ...viewData, readOnly: false });
      return;
    }

    res.render('tournament', {
      ...viewData,
      liveBracketUrl: absoluteUrl(req, `/brackets/${publicToken}`),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/details', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    await query(
      `UPDATE tournaments
       SET name = $1,
           description = $2,
           rules = $3,
           prize = $4,
           status = $5,
           max_participants = $6,
           default_region = $7,
           signup_closes_at = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [
        cleanText(req.body.name, 100) || 'Untitled Tournament',
        cleanMultiline(req.body.description, 1000),
        cleanMultiline(req.body.rules, 1000),
        cleanMultiline(req.body.prize, 500),
        normalizeTournamentStatus(req.body.status),
        toInt(req.body.max_participants),
        cleanText(req.body.default_region, 50),
        toDateOrNull(req.body.signup_closes_at),
        tournamentId,
      ],
    );

    await notifyTournamentUpdated(tournamentId);

    if (wantsJson(req)) {
      res.json({ ok: true, tournamentId });
      return;
    }

    flash(req, 'success', 'Tournament details saved.');
    res.redirect(`/tournaments/${tournamentId}`);
  } catch (error) {
    if (wantsJson(req)) {
      res.status(500).json({ ok: false, message: error.message || 'Could not save tournament details.' });
      return;
    }

    next(error);
  }
});

app.post('/tournaments/:id/participants', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    await query(
      `INSERT INTO tournament_participants
        (tournament_id, discord_id, discord_username, roblox_username, roblox_display_name, region, seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tournament_id, discord_id)
       DO UPDATE SET
         discord_username = EXCLUDED.discord_username,
         roblox_username = EXCLUDED.roblox_username,
         roblox_display_name = EXCLUDED.roblox_display_name,
         region = EXCLUDED.region,
         seed = EXCLUDED.seed,
         updated_at = NOW()`,
      [
        tournamentId,
        cleanText(req.body.discord_id, 80) || `manual-${Date.now()}`,
        cleanText(req.body.discord_username, 80) || 'Manual Player',
        cleanText(req.body.roblox_username, 50) || 'RobloxPlayer',
        cleanText(req.body.roblox_display_name, 50),
        cleanText(req.body.region, 50),
        toInt(req.body.seed),
      ],
    );
    await touchTournament(tournamentId);
    flash(req, 'success', 'Participant saved. Rebuild the bracket if it was already generated.');
    res.redirect(`/tournaments/${tournamentId}#participants`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/participants/:participantId/delete', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    await query('DELETE FROM tournament_participants WHERE id = $1 AND tournament_id = $2', [
      toInt(req.params.participantId),
      tournamentId,
    ]);
    await touchTournament(tournamentId);
    flash(req, 'success', 'Participant deleted. Rebuild the bracket if needed.');
    res.redirect(`/tournaments/${tournamentId}#participants`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/participants/:participantId', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    await query(
      `UPDATE tournament_participants
       SET discord_username = $1,
           roblox_username = $2,
           roblox_display_name = $3,
           region = $4,
           seed = $5,
           updated_at = NOW()
       WHERE id = $6 AND tournament_id = $7`,
      [
        cleanText(req.body.discord_username, 80),
        cleanText(req.body.roblox_username, 50),
        cleanText(req.body.roblox_display_name, 50),
        cleanText(req.body.region, 50),
        toInt(req.body.seed),
        toInt(req.params.participantId),
        tournamentId,
      ],
    );
    await touchTournament(tournamentId);
    flash(req, 'success', 'Participant updated.');
    res.redirect(`/tournaments/${tournamentId}#participants`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/seed-sequential', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    const participants = await loadParticipants(tournamentId);
    await withTransaction(async (client) => {
      for (let index = 0; index < participants.length; index += 1) {
        await client.query('UPDATE tournament_participants SET seed = $1, updated_at = NOW() WHERE id = $2', [
          index + 1,
          participants[index].id,
        ]);
      }
    });
    await touchTournament(tournamentId);
    flash(req, 'success', 'Seeds updated from 1 to ' + participants.length + '.');
    res.redirect(`/tournaments/${tournamentId}#participants`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/shuffle-seeds', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    const participants = await loadParticipants(tournamentId);
    const shuffled = [...participants];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = crypto.randomInt(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    await withTransaction(async (client) => {
      for (let index = 0; index < shuffled.length; index += 1) {
        await client.query('UPDATE tournament_participants SET seed = $1, updated_at = NOW() WHERE id = $2', [
          index + 1,
          shuffled[index].id,
        ]);
      }
    });
    await touchTournament(tournamentId);

    flash(req, 'success', 'Seeds randomized. Rebuild/start the bracket to apply them.');
    res.redirect(`/tournaments/${tournamentId}#participants`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/start', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    const matchCount = await countMatches(tournamentId);

    if (matchCount === 0) {
      flash(req, 'error', 'Generate the bracket before starting the tournament.');
      res.redirect(`/tournaments/${tournamentId}#bracket`);
      return;
    }

    await query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [
      'ongoing',
      tournamentId,
    ]);

    await notifyTournamentUpdated(tournamentId);
    flash(req, 'success', 'Tournament started. The existing bracket was kept.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  } catch (error) {
    flash(req, 'error', error.message || 'Could not start tournament.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  }
});

app.post('/tournaments/:id/regenerate-bracket', requireAuth, async (req, res) => {
  const tournamentId = toInt(req.params.id);

  try {
    await regenerateBracket(tournamentId);
    await notifyTournamentUpdated(tournamentId);
    flash(req, 'success', 'Bracket rebuilt from the current players and seeds.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  } catch (error) {
    flash(req, 'error', error.message || 'Could not rebuild bracket.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  }
});

app.post('/tournaments/:id/reset-results', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    await resetBracketResults(tournamentId);
    await notifyTournamentUpdated(tournamentId);
    flash(req, 'success', 'All reported scores/results were cleared, but the current first-round bracket stayed.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/delete-bracket', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tournamentId]);
      await client.query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [
        'open',
        tournamentId,
      ]);
    });
    await notifyTournamentUpdated(tournamentId);
    flash(req, 'success', 'Bracket deleted. Players are still saved.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/matches/:matchId', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);
  const matchId = toInt(req.params.matchId);

  try {
    await withTransaction(async (client) => {
      const previousResult = await client.query(
        'SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2',
        [matchId, tournamentId],
      );
      const previousMatch = previousResult.rows[0];

      if (!previousMatch) {
        throw new Error('Match not found.');
      }

      const p1Id = toInt(req.body.player1_participant_id);
      const p2Id = toInt(req.body.player2_participant_id);
      const p1 = await getParticipant(client, p1Id);
      const p2 = await getParticipant(client, p2Id);
      const p1Name = p1 ? participantLabel(p1) : cleanText(req.body.player1_name, 100);
      const p2Name = p2 ? participantLabel(p2) : cleanText(req.body.player2_name, 100);
      let score1 = toInt(req.body.score1);
      let score2 = toInt(req.body.score2);
      let winnerSlot = '';
      const action = cleanText(req.body.action, 30);
      const requestedStatus = cleanText(req.body.status, 30);

      if (score1 !== null && score2 === null && cleanText(req.body.score2, 20) === '') {
        score2 = 0;
      } else if (score2 !== null && score1 === null && cleanText(req.body.score1, 20) === '') {
        score1 = 0;
      }

      if (action === 'clear') {
        winnerSlot = '';
      } else if (score1 !== null && score2 !== null && score1 !== score2) {
        winnerSlot = score1 > score2 ? 'p1' : 'p2';
      } else if (score1 === null && score2 === null) {
        winnerSlot = cleanText(req.body.winner_slot || req.body.winner_override, 10);
      }

      const winnerId = winnerSlot === 'p1' ? p1Id : winnerSlot === 'p2' ? p2Id : null;
      const status = winnerId
        ? 'completed'
        : requestedStatus && requestedStatus !== 'completed'
          ? requestedStatus
          : p1Id && p2Id
            ? 'running'
            : 'pending';
      const changesAffectFuture =
        previousMatch.winner_participant_id !== winnerId ||
        previousMatch.player1_participant_id !== p1Id ||
        previousMatch.player2_participant_id !== p2Id ||
        action === 'clear';

      if (changesAffectFuture) {
        await clearDownstreamSlot(client, tournamentId, previousMatch);
      }

      const result = await client.query(
        `UPDATE tournament_matches
         SET player1_participant_id = $1,
             player2_participant_id = $2,
             player1_name = $3,
             player2_name = $4,
             score1 = $5,
             score2 = $6,
             winner_participant_id = $7,
             status = $8,
             updated_at = NOW()
         WHERE id = $9 AND tournament_id = $10
         RETURNING *`,
        [
          p1Id,
          p2Id,
          p1Name,
          p2Name,
          action === 'clear' ? null : score1,
          action === 'clear' ? null : score2,
          winnerId,
          status,
          matchId,
          tournamentId,
        ],
      );

      if (result.rows[0]?.winner_participant_id) {
        await propagateWinner(client, tournamentId, result.rows[0]);
      }

      await autoAdvanceByes(client, tournamentId);
      await repairPrematureAutoAdvances(client, tournamentId);
      await syncTournamentStatus(client, tournamentId);
    });

    await notifyTournamentUpdated(tournamentId);

    if (wantsJson(req)) {
      res.json({ ok: true, tournamentId, matchId });
      return;
    }

    flash(req, 'success', 'Match updated. The next round was synced automatically.');
    res.redirect(`/tournaments/${tournamentId}#match-${matchId}`);
  } catch (error) {
    if (wantsJson(req)) {
      res.status(500).json({ ok: false, message: error.message || 'Could not update match.' });
      return;
    }

    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', { error });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tournament dashboard listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Could not start dashboard:', error);
    process.exit(1);
  });
