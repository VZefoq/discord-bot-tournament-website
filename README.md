# Zef Tournament Dashboard

A simple admin website for tournaments created by the Discord bot.

## Features

- Login with username/password
- View tournaments created by the bot
- Edit tournament name, description, status, max players, and region
- View and edit participants
- Add manual participants
- Automatically generate a single-elimination bracket from participants
- Edit bracket player slots
- Fill in scores
- Pick winner/loser
- Winner automatically moves to the next round

## Login

Default login:

```text
user: admin
password: Poep123@@
```

For hosting, set these environment variables instead of editing code:

```text
ADMIN_USER=admin
ADMIN_PASSWORD=Poep123@@
SESSION_SECRET=use-a-long-random-secret
DATABASE_URL=your-coolify-postgresql-internal-url
DATABASE_SSL=false
PORT=3000
```

## Local run

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Database

The app creates the tables automatically on startup. `schema.sql` is also included if you want to run it manually.

## Coolify notes

Use this as a normal Node.js app. Coolify can build it with Nixpacks or the included Dockerfile.

Recommended app environment variables:

```text
PORT=3000
DATABASE_URL=<internal PostgreSQL connection string from Coolify>
DATABASE_SSL=false
ADMIN_USER=admin
ADMIN_PASSWORD=Poep123@@
SESSION_SECRET=<generate a long random secret>
COOKIE_SECURE=false
```

If your login cookie does not save behind HTTPS, try setting `COOKIE_SECURE=true`.
