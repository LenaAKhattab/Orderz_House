# Orderz House Backend

Production-ready Express API foundation for Orderz House with Neon PostgreSQL connectivity and auth-ready middleware.

## Tech Stack

- Node.js + Express
- PostgreSQL (Neon) via `pg`
- JWT foundation via `jsonwebtoken`
- Password hashing foundation via `bcrypt`

## Available Scripts

- `npm run dev` - Start server with nodemon
- `npm start` - Start server with node
- `npm run db:migrate` - Apply pending SQL files from `sql/migrations` in order (tracks `schema_migrations`; safe to run repeatedly). Requires `DATABASE_URL` in `.env`. Per-file runs still use `npm run db:run -- <path>`.

## Environment Setup

1. Copy the example file and fill in values **only on your machine or in your host’s secret manager**:

```bash
cp .env.example .env
```

2. **Never commit `.env`** or paste production secrets into git. Use your platform’s environment/secret store in production.

Required for a healthy deployment (validated at startup; see `src/config/env.js`):

- `DATABASE_URL` — required; server exits if missing in all environments.
- `JWT_SECRET` — at least 16 characters; required in production.
- `CLIENT_URL` — frontend origin for CORS; required in production.

See `.env.example` for optional keys (Stripe, Resend, Cloudinary, `TRUST_PROXY`, `FAKE_ORDERS_TICK_MS`, etc.).

Frontend (Vite): copy `../frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL` if needed.

## Database Initialization

Run the SQL bootstrap script against your Neon database:

```bash
psql "<your_database_url>" -f sql/init.sql
```

This creates a `users` table with:

- unique email
- role constraint (`super_admin`, `admin`, `client`, `freelancer`)
- active flag and timestamps

## API Endpoints

- `GET /api/health` - Returns API and database status payload

## Project Layout

```text
backend/
├── src/
│   ├── config/
│   │   └── db.js
│   ├── constants/
│   │   └── roles.js
│   ├── controllers/
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── errorMiddleware.js
│   │   └── roleMiddleware.js
│   ├── routes/
│   ├── services/
│   └── app.js
├── sql/
│   └── init.sql
├── server.js
├── .env                 (local only; copy from .env.example — not committed)
├── .env.example
└── package.json
```
