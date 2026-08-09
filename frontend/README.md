# Orderz House Frontend

React + Vite frontend for Orderz House.

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build production assets
- `npm run preview` - Preview built frontend locally
- `npm test` - Unit tests

## Environment Variables

Same-origin API is the default. Create `.env` only when you need an override:

```env
# Optional. Default (recommended): /api
# Local Vite proxies /api → http://localhost:5000
# Production: leave unset or set /api so the browser calls the page origin.
# VITE_API_BASE_URL=/api
```

Legacy absolute URLs (e.g. `http://localhost:5000/api`) still work if set explicitly, but production should use `/api`.

## Health Check Integration

The home page calls `/health` using a centralized axios instance in `src/services/api.js` (base `/api`).
