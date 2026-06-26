# Zef Tournament Dashboard

A Coolify-ready Node.js dashboard for the Discord bot tournament system.

## Login

Default local/admin login:

- Username: `admin`
- Password: `Poep123@@`

Change these in Coolify environment variables before production if needed.

## Challonge-style features

- Single-elimination tournament dashboard
- Discord bot signups appear as participants
- Manual participant add/edit/delete
- Seeds like Challonge
- Auto seed button
- Shuffle seed button
- Start/rebuild bracket from current seeds
- Seeded bracket placement so seed 1 and seed 2 are on opposite sides
- Auto byes for uneven player counts
- Visual mirrored bracket
- Report scores directly on match cards
- Click the ✓ button to mark a player as winner
- Winner automatically moves into the next round
- Undo result clears invalid future rounds
- Reset all results without deleting players
- Delete only the bracket while keeping participants
- Tournament progress and champion display

## Coolify setup

Create a PostgreSQL resource in Coolify and copy its **Postgres URL (internal)**.

Environment variables for the dashboard app:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@YOUR_INTERNAL_POSTGRES_HOST:5432/postgres
DATABASE_SSL=false
ADMIN_USER=admin
ADMIN_PASSWORD=Poep123@@
SESSION_SECRET=make-this-a-long-random-secret
COOKIE_SECURE=false
```

Coolify configuration:

- Build Pack: `Nixpacks`
- Install Command: leave empty or `npm ci`
- Start Command: `npm start`
- Ports Exposes: `3000`
- Static site: off

If Coolify says `npm ci can only install packages when package.json and package-lock.json are in sync`, run locally:

```bash
npm install
git add package.json package-lock.json
git commit -m "Update lockfile"
git push
```

## Local development

```bash
npm install
cp .env.example .env
npm start
```
