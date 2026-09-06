# Production origin / API routing — Orderz House

Documentation-only. **Do not deploy from this file alone** — apply host nginx changes after backend + frontend deploys (see rollout order below).

## Architecture (target)

```text
http(s)://www.orderzhouse.com/*  →  308  https://orderzhouse.com$request_uri
http://orderzhouse.com/*         →  308  https://orderzhouse.com$request_uri
https://orderzhouse.com/*        →  SPA + /api (canonical)
https://orderzhouse.com/api/*    →  Express (private upstream)
```

- **Canonical application URL (`CLIENT_URL`):** `https://orderzhouse.com` (Stripe, emails, redirects).
- **Trusted browser origins (CORS + origin guard):** apex + `https://www.orderzhouse.com` (auto sibling + leftover tabs).
- **Browser API base:** relative `/api` (same origin after redirect).

## Config ownership

| Layer | Role | In repo? |
|-------|------|----------|
| Host nginx (Ubuntu, TLS) | Terminates HTTPS; www→apex redirect; `/` → frontend; `/api` → backend | **No** — operator-owned |
| Frontend container nginx | Serves SPA; optional `/api` proxy to Compose `backend` | Yes — `frontend/nginx.spa.conf` |
| Express | CORS + originGuard from `parseAllowedClientOrigins()` | Yes |

TLS handshake for `https://www…` happens **before** redirect. Certificate must include **both** `orderzhouse.com` and `www.orderzhouse.com` (SAN). Do not drop www from the cert when enabling redirects.

## REPOSITORY CHANGE (done in code)

- SPA `VITE_API_BASE_URL` default `/api`
- Vite/dev + preview proxy `/api` → `localhost:5000`
- Backend auto-trusts www sibling of apex `CLIENT_URL`
- Compose/Dockerfile bake `/api`

## PRODUCTION HOST CONFIG CHANGE REQUIRED

Inspect current files (typical Certbot layout):

```bash
sudo nginx -t
ls -la /etc/nginx/sites-enabled/
# often: orderzhouse.com, or default + snippets from certbot
sudo grep -R "server_name" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
```

### Intent (adapt to existing cert paths / upstream names)

Replace or extend so there is **exactly one** HTTPS apex `server` that serves the app, and www/http only redirect.

```nginx
# --- HTTP: both names → HTTPS apex (one hop) ---
server {
    listen 80;
    listen [::]:80;
    server_name orderzhouse.com www.orderzhouse.com;
    return 308 https://orderzhouse.com$request_uri;
}

# --- HTTPS www → HTTPS apex (preserve path + query) ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.orderzhouse.com;

    # KEEP existing Certbot/ssl_certificate lines for www (or shared cert covering both names)
    # ssl_certificate     /etc/letsencrypt/live/orderzhouse.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/orderzhouse.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 308 https://orderzhouse.com$request_uri;
}

# --- HTTPS apex: real application ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name orderzhouse.com;

    # ssl_certificate … (same or apex cert)
    # …

    client_max_body_size 25m;

    location /api/ {
        # Adjust upstream to your private backend (compose published port or unix socket)
        proxy_pass http://127.0.0.1:3007/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location /images/ {
        proxy_pass http://127.0.0.1:3007/images/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        # Frontend container / static root — adjust to your setup
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Do not** create apex → www redirects. **Do not** leave a second `server_name www` that still serves the SPA.

Validate and reload (operator only, after review):

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Safe rollout order

1. Deploy **backend** (www trusted on CORS + originGuard). Keep `CLIENT_URL=https://orderzhouse.com`.
2. Deploy **frontend** built with `VITE_API_BASE_URL=/api`.
3. Verify apex: homepage + `GET /api/health`.
4. Apply **host nginx** www/http → apex `308` redirects; `nginx -t` then reload.
5. Verify www redirect + apex API.
6. Browser smoke (Chrome / Android / iOS / Instagram WebView) on apex.
7. Monitor nginx 5xx and API health.

## Post-deploy verification (read-only)

```bash
curl -sI https://www.orderzhouse.com/ | tr -d '\r' | head -n 20
# Expect: HTTP/1.1 308 (or 301) and Location: https://orderzhouse.com/

curl -sI "https://www.orderzhouse.com/register?x=1" | tr -d '\r' | head -n 20
# Expect: Location: https://orderzhouse.com/register?x=1

curl -sI http://orderzhouse.com/ | tr -d '\r' | head -n 20
curl -sI http://www.orderzhouse.com/ | tr -d '\r' | head -n 20
# Expect: Location: https://orderzhouse.com/...

curl -sS https://orderzhouse.com/api/health
# Expect: {"success":true,...,"database":"connected",...}

curl -sI -X OPTIONS https://orderzhouse.com/api/auth/register \
  -H "Origin: https://orderzhouse.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | tr -d '\r'
# Expect: Access-Control-Allow-Origin: https://orderzhouse.com

curl -sI -X OPTIONS https://orderzhouse.com/api/auth/register \
  -H "Origin: https://www.orderzhouse.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | tr -d '\r'
# Expect during/after transition: Access-Control-Allow-Origin: https://www.orderzhouse.com

curl -sI -X OPTIONS https://orderzhouse.com/api/auth/register \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST" | tr -d '\r'
# Expect: no Access-Control-Allow-Origin for evil.example
```

Do **not** POST real registration against production unless explicitly approved.

## Monitoring / regression prevention

- Synthetic: `https://www.orderzhouse.com` must redirect to apex.
- Synthetic: `https://orderzhouse.com/api/health` → 200 JSON.
- Alert nginx `502`/`503`/`504` on `/api`.
- Optionally log origin-guard `FORBIDDEN_ORIGIN` (already returns JSON `code`).

## Cookies

Keep host-only cookies on apex (`Domain` unset). After www redirects, sessions stay on `orderzhouse.com`. Do not set `Domain=.orderzhouse.com` unless a future requirement needs subdomain sharing.
