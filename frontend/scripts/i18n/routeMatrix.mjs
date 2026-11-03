#!/usr/bin/env node
/**
 * Route / role matrix for localization QA — discovered from src/App.jsx (never from old counts).
 * Each route: path, role (public | client | freelancer | admin | super_admin | financial | shared | auth),
 * guard (RequireRole / RequireStaffPage / RequireAuth / none), dynamic params.
 *   node scripts/i18n/routeMatrix.mjs            # summary
 *   node scripts/i18n/routeMatrix.mjs --json out.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "../../src/App.jsx");

export function extractRoutes(source = readFileSync(APP, "utf8")) {
  const src = source.replace(/\r\n/g, "\n");
  const routes = [];
  const re = /<Route\b([^>]*?)(\/>|>)/g;
  const authStart = src.indexOf("<Route element={<RequireAuth />}>");
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    const pathMatch = /\bpath="([^"]+)"/.exec(attrs) || /\bpath=\{"([^"]+)"\}/.exec(attrs);
    const index = /\bindex\b/.test(attrs);
    if (!pathMatch && !index) continue;
    const path = pathMatch ? pathMatch[1] : "(index)";
    // Element block: from this Route to the next "<Route" (covers multi-line element={…} guards).
    const next = src.indexOf("<Route", m.index + 6);
    const block = src.slice(m.index, next < 0 ? undefined : next);
    const roleGuard = /allowedRoles=\{\[([^\]]*)\]\}/.exec(block);
    const staffGuard = /<RequireStaffPage permission=\{([^}]+)\}/.exec(block);
    const permGuard = /<RequirePermission[^>]*permission=\{?["']?([\w.]+)/.exec(block);
    const inAuth = authStart >= 0 && m.index > authStart;
    let role;
    if (/^\/dashboard\/super-admin/.test(path)) role = "super_admin";
    else if (/^\/dashboard\/admin/.test(path)) role = "admin";
    else if (/^\/dashboard\/freelancer/.test(path)) role = "freelancer";
    else if (/^\/dashboard\/client/.test(path)) role = "client";
    else if (/^\/dashboard\/financial/.test(path)) role = "financial";
    else if (/^\/dashboard/.test(path) || inAuth) role = "shared";
    else if (/^\/(login|register|forgot-password|reset-password|verify)/.test(path)) role = "auth";
    else role = "public";
    if (roleGuard && /SUPER_ADMIN/.test(roleGuard[1]) && !/ADMIN\b(?!_)/.test(roleGuard[1].replace(/SUPER_ADMIN/g, ""))) role = role === "shared" ? "super_admin" : role;
    routes.push({
      path,
      role,
      guard: roleGuard ? `RequireRole(${roleGuard[1].replace(/ROLE\./g, "").trim()})` : staffGuard ? `RequireStaffPage(${staffGuard[1].trim()})` : permGuard ? `RequirePermission(${permGuard[1]})` : inAuth ? "RequireAuth" : "none",
      dynamic: /:[A-Za-z]/.test(path) || path === "*",
    });
  }
  return routes;
}

function main() {
  const routes = extractRoutes();
  const byRole = {};
  for (const r of routes) byRole[r.role] = (byRole[r.role] || 0) + 1;
  console.log(`ROUTES total=${routes.length} static=${routes.filter((r) => !r.dynamic).length} dynamic=${routes.filter((r) => r.dynamic).length} byRole=${JSON.stringify(byRole)}`);
  const i = process.argv.indexOf("--json");
  if (i >= 0 && process.argv[i + 1]) writeFileSync(process.argv[i + 1], `${JSON.stringify(routes, null, 1)}\n`);
  if (process.argv.includes("--list")) for (const r of routes) console.log(`${r.role}\t${r.guard}\t${r.path}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
