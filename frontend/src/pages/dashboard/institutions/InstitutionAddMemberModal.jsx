import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import DashboardModal from "../../../components/dashboard/DashboardModal";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { adminSearchUsersForInstitutionRequest } from "../../../services/api";
import { isAxiosCanceledError } from "../../../utils/apiErrorMessage";
import { shouldSearchUsers } from "./institutionMemberSearchUtils";

function platformRoleLabel(role, t) {
  if (role === "freelancer") return t("dashboard.roles.freelancer");
  if (role === "client") return t("dashboard.roles.client");
  if (role === "admin") return t("dashboard.roles.admin");
  if (role === "super_admin" || role === "superAdmin") return t("dashboard.roles.superAdmin");
  return role ? String(role) : null;
}

/**
 * Add-member search modal for institution details — presentation only.
 * Reuses existing search/add APIs and membership rules.
 */
export default function InstitutionAddMemberModal({
  open,
  onClose,
  onAddMember,
  addingUserId = null,
  existingActiveMemberIds = null,
  triggerRef = null,
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const searchAbortRef = useRef(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const busy = Boolean(addingUserId);
  const activeIds =
    existingActiveMemberIds instanceof Set
      ? existingActiveMemberIds
      : new Set((existingActiveMemberIds || []).map((id) => String(id)));

  useEffect(() => {
    if (!open) return;
    setSearchQ("");
    setSearchResults([]);
    setSearching(false);
    setSearchAttempted(false);
    setSearchError(null);
    if (searchAbortRef.current) searchAbortRef.current.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const q = searchQ.trim();
    if (!shouldSearchUsers(q)) {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      setSearchResults([]);
      setSearchAttempted(false);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchAttempted(true);
      setSearchError(null);
      try {
        const res = await adminSearchUsersForInstitutionRequest(
          { q, limit: 12 },
          { signal: controller.signal },
        );
        if (!cancelled && !controller.signal.aborted) {
          setSearchResults(res?.data?.users || []);
        }
      } catch (e) {
        if (isAxiosCanceledError(e) || cancelled || controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(t("dashboard.institutions.searchError"));
      } finally {
        if (!cancelled && !controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchQ, t]);

  const clearSearch = () => {
    setSearchQ("");
    setSearchResults([]);
    setSearchAttempted(false);
    setSearchError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const requestClose = () => {
    if (busy) return;
    onClose?.();
  };

  const trimmed = searchQ.trim();
  const canSearch = shouldSearchUsers(trimmed);

  return (
    <DashboardModal
      open={open}
      title={t("dashboard.institutions.addMemberModalTitle")}
      subtitle={t("dashboard.institutions.addMemberModalSubtitle")}
      onClose={requestClose}
      closeDisabled={busy}
      triggerRef={triggerRef}
      className="dash-ui-modal--institution-add-member"
      panelClassName="max-w-[min(620px,92vw)]"
      footer={
        <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={busy}>
          {t("dashboard.institutions.cancel")}
        </button>
      }
    >
      <div className="oh-inst-add-member grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[0.78rem] font-bold text-slate-600">{t("dashboard.institutions.searchUsers")}</span>
          <div className="oh-inst-add-member__search relative flex min-w-0 items-center">
            <Search
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute start-3 z-[1] text-slate-400"
              aria-hidden
            />
            <input
              ref={inputRef}
              className="input w-full min-w-0 pe-10 ps-9"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("dashboard.institutions.searchUsersPlaceholder")}
              aria-label={t("dashboard.institutions.searchUsers")}
              autoComplete="off"
              disabled={busy}
            />
            {searchQ ? (
              <button
                type="button"
                className="absolute end-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={clearSearch}
                aria-label={t("dashboard.institutions.clearSearch")}
                disabled={busy}
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        </label>

        {!canSearch && trimmed.length > 0 ? (
          <p className="m-0 text-sm text-slate-500">{t("dashboard.institutions.searchMinLengthHint")}</p>
        ) : null}
        {!canSearch && trimmed.length === 0 ? (
          <p className="m-0 text-sm text-slate-500">{t("dashboard.institutions.searchIdleHint")}</p>
        ) : null}

        {searching ? <p className="m-0 text-sm text-slate-600">{t("dashboard.institutions.searching")}</p> : null}

        {searchError ? (
          <p role="alert" className="m-0 text-sm text-red-700">
            {searchError}
          </p>
        ) : null}

        {!searching && !searchError && searchAttempted && searchResults.length === 0 ? (
          <p className="m-0 text-sm text-slate-600">{t("dashboard.institutions.searchNoResults")}</p>
        ) : null}

        {searchResults.length > 0 ? (
          <ul className="oh-inst-add-member__results m-0 grid list-none gap-2 p-0">
            {searchResults.map((u) => {
              const isCurrent = activeIds.has(String(u.id));
              const roleLabel = platformRoleLabel(u.role, t);
              const name = u.fullName || u.name || "—";
              return (
                <li
                  key={u.id}
                  className="oh-inst-add-member__row flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 break-words text-sm font-bold text-slate-900">{name}</p>
                    <p className="m-0 mt-0.5 break-all text-[0.82rem] text-slate-600" dir="ltr">
                      {u.email || "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.72rem] font-semibold text-slate-500">
                      {roleLabel ? (
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5">{roleLabel}</span>
                      ) : null}
                      {isCurrent ? (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                          {t("dashboard.institutions.currentMemberBadge")}
                        </span>
                      ) : (
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5">
                          {t("dashboard.institutions.notAMemberYet")}
                        </span>
                      )}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="inline-flex min-h-[2.25rem] items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-900">
                      {t("dashboard.institutions.currentMemberBadge")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary shrink-0"
                      disabled={busy}
                      onClick={() => void onAddMember?.(u)}
                    >
                      <UserPlus size={16} aria-hidden /> {t("dashboard.institutions.addMemberBtn")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </DashboardModal>
  );
}
