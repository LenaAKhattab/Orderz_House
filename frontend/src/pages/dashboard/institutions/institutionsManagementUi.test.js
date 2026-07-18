/**
 * Institutions management UI wiring + permission alignment tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "../../../constants/authRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("institutions management frontend", () => {
  it("list page uses DashboardTable with search filter pagination", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionsPage.jsx");
    assert.match(src, /DashboardTable/);
    assert.match(src, /adminListInstitutionsRequest/);
    assert.match(src, /debouncedQ|setDebouncedQ/);
    assert.match(src, /statusFilter/);
    assert.match(src, /Pagination/);
    assert.match(src, /resetFilters/);
    assert.match(src, /resultsCount/);
    assert.match(src, /pagination\.total/);
    assert.doesNotMatch(src, /limit:\s*100/);
    assert.match(src, /adminCreateInstitutionRequest/);
    assert.match(src, /duplicateName|DUPLICATE_INSTITUTION_NAME/);
    assert.match(src, /oh-institutions-mobile-cards|md:hidden/);
    assert.match(src, /summary\.totalInstitutions|metricTotal/);
    assert.match(src, /StatusBadge|min-w-\[4\.75rem\]/);
    assert.match(src, /formatSubscriptionAdminDate/);
    assert.match(src, /oh-inst-name-link/);
    assert.match(src, /title=\{name\}/);
    assert.match(src, /DETAIL_BASE\/\$\{inst\.id\}|`\$\{DETAIL_BASE\}\/\$\{inst\.id\}`/);
    assert.match(src, /oh-institutions-results-meta|oh-institutions-list-toolbar/);
    assert.match(src, /oh-inst-col-name|table-layout|oh-institutions-desktop-table/);
    assert.match(src, /grid-cols-2.*lg:grid-cols-5|dash-ui-form-card/);
    assert.match(src, /aria-invalid|aria-describedby/);
    assert.match(src, /emptyFiltered|DashboardEmptyState/);
    assert.doesNotMatch(src, /toLocaleDateString/);
    assert.doesNotMatch(src, /function formatDate\(/);
  });

  it("list table name links to details and truncates long names on desktop", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionsPage.jsx");
    const css = read("src/styles/adminDashboardShell.css");
    assert.match(src, /to=\{detailTo\}/);
    assert.match(src, /className="oh-inst-name-link"/);
    assert.match(src, /btn btn-secondary/);
    assert.match(src, /dashboard\.institutions\.manage/);
    assert.match(css, /\.oh-institutions-desktop-table/);
    assert.match(css, /text-overflow:\s*ellipsis/);
    assert.match(css, /table-layout:\s*fixed/);
    assert.match(css, /\.oh-inst-name-link:focus-visible/);
    assert.match(src, /break-words/);
    assert.match(src, /oh-institutions-mobile-cards/);
  });

  it("detail page supports edit, activate/deactivate, linked storages, membership search", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionDetailPage.jsx");
    const modal = read("src/pages/dashboard/institutions/InstitutionAddMemberModal.jsx");
    assert.match(src, /adminPatchInstitutionRequest/);
    assert.match(src, /adminGetInstitutionDeactivationImpactRequest/);
    assert.match(src, /adminListInstitutionStoragesRequest/);
    assert.match(src, /DashboardTable/);
    assert.match(src, /ConfirmDialog/);
    assert.match(src, /panelClassName/);
    assert.match(src, /confirmDeactivateTitle|deactivate/);
    assert.match(src, /impactCriticalSoleInstitution/);
    assert.match(src, /InstitutionAddMemberModal/);
    assert.match(src, /addMemberOpen|setAddMemberOpen/);
    assert.match(modal, /shouldSearchUsers|institutionMemberSearchUtils/);
    assert.match(read("src/pages/dashboard/institutions/institutionMemberSearchUtils.js"), /\\d\+/);
    assert.match(modal, /adminSearchUsersForInstitutionRequest/);
    assert.match(modal, /currentMemberBadge|isCurrent/);
    assert.match(modal, /DashboardModal/);
    assert.match(src, /memberReactivated|reactivated/);
    assert.match(src, /DUPLICATE_MEMBERSHIP|memberAlreadyActive/);
    assert.match(src, /memberRole/);
    assert.match(src, /break-words/);
    assert.match(src, /activeMemberIds|existingActiveMemberIds/);
    assert.doesNotMatch(src, /DashboardSection title=\{t\("dashboard\.institutions\.addMember"\)\}/);
    assert.match(src, /AbortController/);
    assert.match(src, /isAxiosCanceledError/);
    assert.match(src, /sectionTimeout|sectionLoadError/);
    assert.match(src, /SectionInlineError/);
    assert.match(src, /loadOverview|loadMembers|loadStorages|loadInitialBundle/);
    assert.match(src, /actionSaveError|actionAddMemberError/);
    assert.match(src, /overviewStatus === 403|forbidden/);
    assert.match(src, /notFound/);
    assert.match(src, /statsOrdersCount|statsUsersCount|statsOrdersTotalAmount/);
    assert.match(src, /formatJodMoney|JodMoneyValue/);
    assert.match(src, /<bdi dir="ltr"/);
    assert.doesNotMatch(src, /formatInstitutionMoney|Intl\.NumberFormat\(locale === "en" \? "en-JO" : "ar-JO"/);
    assert.match(src, /adminFreezeInstitutionRequest|adminUnfreezeInstitutionRequest/);
    assert.match(src, /confirmFreezeTitle|confirmUnfreezeTitle/);
    assert.match(src, /dashboard\.institutions\.frozen/);
    // Passive reads must not toast the generic timeout via push on load
    assert.doesNotMatch(src, /push\(\{\s*type:\s*"error",\s*message:\s*getSafeApiErrorMessage/);
    assert.doesNotMatch(src, /Promise\.all\(\[\s*adminGetInstitutionRequest/);
  });

  it("add-member modal uses debounce, LTR-safe results, and no inline page search form", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionDetailPage.jsx");
    const modal = read("src/pages/dashboard/institutions/InstitutionAddMemberModal.jsx");
    const ar = read("src/locales/ar/dashboard.json");
    assert.match(modal, /setTimeout/);
    assert.match(modal, /, 300\)/);
    assert.match(modal, /Search|lucide-react/);
    assert.match(modal, /clearSearch|setSearchQ\(""\)/);
    assert.match(ar, /"addMemberModalTitle"/);
    assert.match(ar, /"currentMemberBadge"/);
    assert.match(src, /membersCount/);
    assert.match(src, /UserPlus/);
    assert.doesNotMatch(src, /adminSearchUsersForInstitutionRequest/);
    assert.doesNotMatch(src, /searchUsersPlaceholder/);
  });

  it("detail initial load uses bundled GET and passive timeouts stay inline", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionDetailPage.jsx");
    const api = read("src/services/api.js");
    const ar = read("src/locales/ar/dashboard.json");

    // Canonical paint: one bundle request (not parallel institution+members+storages)
    assert.match(src, /bundle:\s*true/);
    assert.match(src, /loadInitialBundle/);
    assert.match(src, /lastFetchedMembersPageRef|lastFetchedStoragesPageRef/);
    assert.match(api, /bundle:\s*1/);
    assert.match(api, /INSTITUTIONS_ADMIN_READ_TIMEOUT_MS\s*=\s*20000/);
    assert.match(api, /institutionBundleInflight/);

    // Inline section error + retry (not global timeout toast string)
    assert.match(src, /SectionInlineError/);
    assert.match(src, /passiveSectionMessage/);
    assert.match(src, /onRetry=\{\(\) => void loadInitialBundle/);
    assert.match(src, /onRetry=\{\(\) => void loadMembers/);
    assert.match(src, /onRetry=\{\(\) => void loadStorages/);
    assert.match(ar, /"sectionTimeout"/);
    assert.doesNotMatch(src, /auth\.errors\.requestTimeout|استغرق الطلب وقتًا طويلًا/);

    // Cancelled / aborted passive reads must not push errors
    assert.match(src, /isAxiosCanceledError\(e\)[\s\S]{0,80}return/);
    assert.doesNotMatch(
      src,
      /catch \(e\) \{[\s\S]{0,120}push\(\{\s*type:\s*"error"[\s\S]{0,80}loadInitialBundle/,
    );

    // Write actions still use action-specific toasts
    assert.match(src, /actionSaveError/);
    assert.match(src, /actionAddMemberError/);
    assert.match(src, /actionRemoveMemberError/);
    assert.match(src, /actionActivateError|actionDeactivateError/);
    assert.match(src, /push\(\{\s*type:\s*"error",\s*message:\s*msg\s*\}\)/);

    // 403/404 full-page handling preserved
    assert.match(src, /overviewStatus === 403/);
    assert.match(src, /overviewStatus === 404/);

    // Failed section does not gate the whole page once institution is present
    assert.match(src, /membersError/);
    assert.match(src, /storagesError/);
    assert.match(src, /if \(overviewError && !institution\)/);
  });

  it("API client exposes patch and linked-storage helpers", () => {
    const src = read("src/services/api.js");
    assert.match(src, /adminPatchInstitutionRequest/);
    assert.match(src, /adminGetInstitutionDeactivationImpactRequest/);
    assert.match(src, /adminListInstitutionStoragesRequest/);
    assert.match(src, /adminGetInstitutionRequest[\s\S]*bundle/);
  });

  it("ConfirmDialog traps focus and supports Escape", () => {
    const src = read("src/components/dashboard/ConfirmDialog.jsx");
    assert.match(src, /Escape/);
    assert.match(src, /panelClassName/);
    assert.match(src, /previousFocusRef|focusable/);
    assert.match(src, /max-h-\[min\(90vh/);
  });

  it("routes use RequireStaffPage for institutions permission", () => {
    const app = read("src/App.jsx");
    assert.match(app, /RequireStaffPage permission=\{SUPER_ADMIN_PAGE_PERMISSIONS\.institutions\}/);
    assert.doesNotMatch(
      app,
      /path="\/dashboard\/super-admin\/institutions"[\s\S]{0,200}?RequireRole allowedRoles=\{\[ROLE\.SUPER_ADMIN\]\}/,
    );
  });

  it("auth allowlist permits delegated Admin on institutions path", () => {
    assert.equal(canRoleAccessPath("/dashboard/super-admin/institutions", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/institutions/9", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/institutions", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/institutions", ROLE.CLIENT), false);
  });

  it("institutions permission is assignable in FE constants", () => {
    const src = read("src/constants/dashboardPermissions.js");
    assert.match(src, /institutions:\s*"dashboard\.super_admin\.institutions"/);
    assert.match(src, /SUPER_ADMIN_PAGE_PERMISSIONS\.institutions/);
    assert.match(src, /ASSIGNABLE_DASHBOARD_PERMISSIONS[\s\S]*institutions/);
  });

  it("locales removed coming-soon placeholders and include management strings", () => {
    const ar = read("src/locales/ar/dashboard.json");
    const en = read("src/locales/en/dashboard.json");
    assert.doesNotMatch(ar, /"placeholderTitle":\s*"قريباً"/);
    assert.doesNotMatch(en, /"placeholderTitle":\s*"Coming soon"/);
    assert.match(ar, /"edit":\s*"تعديل المؤسسة"/);
    assert.match(en, /"deactivate"/);
    assert.match(ar, /"linkedStoragesSection"/);
    assert.match(en, /"memberReactivated"/);
    assert.match(ar, /"duplicateName"/);
  });
});
