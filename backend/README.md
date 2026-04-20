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

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure values:

```bash
cp .env.example .env
```

Required env variables:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV`
- `CLIENT_URL`

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
├── .env
├── .env.example
└── package.json
```
