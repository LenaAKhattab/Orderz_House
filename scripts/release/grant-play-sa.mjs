#!/usr/bin/env node
// One-time Play Console grant for the OrderzHouse release service account, done by the
// company admin's own OAuth identity (gcloud application-default credentials with the
// androidpublisher scope). App-level permissions on com.orderzhouse.app ONLY; no account-wide
// permissions. Usage:
//   node scripts/release/grant-play-sa.mjs --developer <id> [--apply]
// Without --apply it only lists current users (read-only).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(here, 'play-release.config.json'), 'utf8'));
const args = process.argv.slice(2);
const dev = args[args.indexOf('--developer') + 1];
const apply = args.includes('--apply');
if (!/^\d{6,}$/.test(dev || '')) throw new Error('--developer <numeric id> required');

const PKG = cfg.packageName;
const SA = cfg.serviceAccountEmail;
const PERMS = ['CAN_VIEW_NON_FINANCIAL_DATA', 'CAN_MANAGE_TRACK_APKS'];
if (PKG !== 'com.orderzhouse.app' || !SA.endsWith('@orderzhouse-play-publisher.iam.gserviceaccount.com')) {
  throw new Error('config does not point at the OrderzHouse package / dedicated SA');
}

const gcloud = process.platform === 'win32'
  ? '"C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"' : 'gcloud';
const token = execFileSync(gcloud, ['auth', 'application-default', 'print-access-token'],
  { encoding: 'utf8', shell: process.platform === 'win32' }).trim();

const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/developers/${dev}`;
async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // ADC user credentials need an explicit quota project; use the dedicated publishing project.
      'x-goog-user-project': SA.split('@')[1].split('.')[0],
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(base, '')} -> ${r.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const users = [];
let pageToken = '';
do {
  const res = await call('GET', `${base}/users?pageSize=-1${pageToken ? `&pageToken=${pageToken}` : ''}`);
  users.push(...(res.users || []));
  pageToken = res.nextPageToken || '';
} while (pageToken);
console.log(`developer ${dev}: ${users.length} users`);
const existing = users.find((u) => u.email?.toLowerCase() === SA.toLowerCase());
console.log('service account entry:', existing ? JSON.stringify(existing) : 'none');
const apps = new Set(users.flatMap((u) => (u.grants || []).map((g) => g.packageName)));
console.log('packages seen in grants:', [...apps].join(', ') || '(none visible)');

if (!apply) { console.log('read-only: pass --apply to grant'); process.exit(0); }

if (!existing) {
  const res = await call('POST', `${base}/users`, {
    email: SA,
    developerAccountPermissions: [],
    grants: [{ packageName: PKG, appLevelPermissions: PERMS }],
  });
  console.log('CREATED', JSON.stringify(res));
} else {
  if ((existing.developerAccountPermissions || []).length) {
    throw new Error('SA already has account-wide permissions — refusing; review manually');
  }
  const g = (existing.grants || []).find((x) => x.packageName === PKG);
  const name = `developers/${dev}/users/${SA}/grants/${PKG}`;
  const res = g
    ? await call('PATCH', `https://androidpublisher.googleapis.com/androidpublisher/v3/${name}?updateMask=appLevelPermissions`,
      { appLevelPermissions: PERMS })
    : await call('POST', `${base}/users/${encodeURIComponent(SA)}/grants`,
      { packageName: PKG, appLevelPermissions: PERMS });
  console.log('GRANT', JSON.stringify(res));
}
