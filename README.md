# Orderz House

Production-ready monorepo starter for a full-stack SaaS application with auth-ready architecture and Neon PostgreSQL foundation.

## Project Structure

```text
orderz-house/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js
│   │   ├── constants/
│   │   │   └── roles.js
│   │   ├── controllers/
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js
│   │   │   ├── errorMiddleware.js
│   │   │   └── roleMiddleware.js
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── app.js
│   ├── sql/
│   │   └── init.sql
│   ├── server.js
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── .env
│   ├── package.json
│   └── README.md
└── .gitignore
```

## Backend Setup

```bash
cd backend
npm install
npm run dev
```

Backend runs at `http://localhost:5000`.

Initialize database schema:

```bash
psql "<your_database_url>" -f sql/init.sql
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` by default.

## Environment Variables

Backend (`backend/.env`):

```env
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=change_this_to_a_strong_secret
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

Frontend (`frontend/.env`):

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Roles Foundation

- `super_admin`
- `admin`
- `client`
- `freelancer`

These roles are centralized in `backend/src/constants/roles.js` and prepared for auth, dashboard permissions, and route protection.

## Health Check Flow

- Backend exposes `GET /api/health` with API + DB status.
- Frontend calls `${VITE_API_BASE_URL}/health` via axios.
- Home page renders message, timestamp, and DB connection hint.
