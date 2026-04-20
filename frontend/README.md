# Orderz House Frontend

React + Vite frontend for Orderz House.

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build production assets
- `npm run preview` - Preview built frontend locally

## Environment Variables

Create or edit `.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Health Check Integration

The home page calls `/health` using a centralized axios instance in `src/services/api.js`.
