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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
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

function participantLabel(participant) {
  if (!participant) return '';
  const roblox = participant.roblox_username || participant.player_name || '';
  const discord = participant.discord_username ? ` (${participant.discord_username})` : '';
  return `${roblox}${discord}`.trim();
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

async function loadTournament(id) {
  const result = await query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return result.rows[0] || null;
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
       p1.roblox_username AS p1_roblox, p1.discord_username AS p1_discord,
       p2.roblox_username AS p2_roblox, p2.discord_username AS p2_discord,
       w.roblox_username AS winner_roblox, w.discord_username AS winner_discord
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
    player1_label: match.p1_roblox ? `${match.p1_roblox} (${match.p1_discord})` : match.player1_name,
    player2_label: match.p2_roblox ? `${match.p2_roblox} (${match.p2_discord})` : match.player2_name,
    winner_label: match.winner_roblox ? `${match.winner_roblox} (${match.winner_discord})` : '',
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

async function regenerateBracket(tournamentId) {
  const participants = await loadParticipants(tournamentId);

  if (participants.length < 2) {
    throw new Error('You need at least 2 participants to generate a bracket.');
  }

  const size = nextPowerOfTwo(participants.length);
  const rounds = Math.log2(size);
  const slots = [...participants];
  while (slots.length < size) slots.push(null);

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
  });
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

app.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.*,
        COUNT(DISTINCT p.id)::int AS participant_count,
        COUNT(DISTINCT m.id)::int AS match_count
       FROM tournaments t
       LEFT JOIN tournament_participants p ON p.tournament_id = t.id
       LEFT JOIN tournament_matches m ON m.tournament_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
    );

    res.render('dashboard', { tournaments: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100) || 'Untitled Tournament';
    const description = cleanText(req.body.description, 1000);
    const maxParticipants = toInt(req.body.max_participants);
    const defaultRegion = cleanText(req.body.default_region, 50);

    const result = await query(
      `INSERT INTO tournaments (guild_id, name, description, max_participants, default_region)
       VALUES ('dashboard', $1, $2, $3, $4)
       RETURNING id`,
      [name, description, maxParticipants, defaultRegion],
    );

    flash(req, 'success', 'Tournament created.');
    res.redirect(`/tournaments/${result.rows[0].id}`);
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

    const participants = await loadParticipants(tournamentId);
    const matches = await loadMatches(tournamentId);
    const rounds = matches.reduce((groups, match) => {
      if (!groups[match.round_number]) groups[match.round_number] = [];
      groups[match.round_number].push(match);
      return groups;
    }, {});

    res.render('tournament', { tournament, participants, matches, rounds });
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
           status = $3,
           max_participants = $4,
           default_region = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [
        cleanText(req.body.name, 100) || 'Untitled Tournament',
        cleanText(req.body.description, 1000),
        cleanText(req.body.status, 30) || 'signup',
        toInt(req.body.max_participants),
        cleanText(req.body.default_region, 50),
        tournamentId,
      ],
    );
    flash(req, 'success', 'Tournament details saved.');
    res.redirect(`/tournaments/${tournamentId}`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/participants', requireAuth, async (req, res, next) => {
  try {
    const tournamentId = toInt(req.params.id);
    await query(
      `INSERT INTO tournament_participants
        (tournament_id, discord_id, discord_username, roblox_username, region, seed)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, discord_id)
       DO UPDATE SET
         discord_username = EXCLUDED.discord_username,
         roblox_username = EXCLUDED.roblox_username,
         region = EXCLUDED.region,
         seed = EXCLUDED.seed,
         updated_at = NOW()`,
      [
        tournamentId,
        cleanText(req.body.discord_id, 80) || `manual-${Date.now()}`,
        cleanText(req.body.discord_username, 80) || 'Manual Player',
        cleanText(req.body.roblox_username, 50) || 'RobloxPlayer',
        cleanText(req.body.region, 50),
        toInt(req.body.seed),
      ],
    );
    flash(req, 'success', 'Participant saved.');
    res.redirect(`/tournaments/${tournamentId}`);
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
    flash(req, 'success', 'Participant deleted. Regenerate the bracket if needed.');
    res.redirect(`/tournaments/${tournamentId}`);
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
           region = $3,
           seed = $4,
           updated_at = NOW()
       WHERE id = $5 AND tournament_id = $6`,
      [
        cleanText(req.body.discord_username, 80),
        cleanText(req.body.roblox_username, 50),
        cleanText(req.body.region, 50),
        toInt(req.body.seed),
        toInt(req.params.participantId),
        tournamentId,
      ],
    );
    flash(req, 'success', 'Participant updated.');
    res.redirect(`/tournaments/${tournamentId}`);
  } catch (error) {
    next(error);
  }
});

app.post('/tournaments/:id/regenerate-bracket', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);

  try {
    await regenerateBracket(tournamentId);
    flash(req, 'success', 'Bracket regenerated from current participants.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  } catch (error) {
    flash(req, 'error', error.message || 'Could not regenerate bracket.');
    res.redirect(`/tournaments/${tournamentId}#bracket`);
  }
});

app.post('/tournaments/:id/matches/:matchId', requireAuth, async (req, res, next) => {
  const tournamentId = toInt(req.params.id);
  const matchId = toInt(req.params.matchId);

  try {
    await withTransaction(async (client) => {
      const p1Id = toInt(req.body.player1_participant_id);
      const p2Id = toInt(req.body.player2_participant_id);
      const p1 = await getParticipant(client, p1Id);
      const p2 = await getParticipant(client, p2Id);
      const p1Name = p1 ? participantLabel(p1) : cleanText(req.body.player1_name, 100);
      const p2Name = p2 ? participantLabel(p2) : cleanText(req.body.player2_name, 100);
      const winnerSlot = req.body.winner_slot;
      const winnerId = winnerSlot === 'p1' ? p1Id : winnerSlot === 'p2' ? p2Id : null;
      const status = winnerId ? 'completed' : cleanText(req.body.status, 30) || 'pending';

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
          toInt(req.body.score1),
          toInt(req.body.score2),
          winnerId,
          status,
          matchId,
          tournamentId,
        ],
      );

      if (result.rows[0]?.winner_participant_id) {
        await propagateWinner(client, tournamentId, result.rows[0]);
      }
    });

    flash(req, 'success', 'Match saved.');
    res.redirect(`/tournaments/${tournamentId}#match-${matchId}`);
  } catch (error) {
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
