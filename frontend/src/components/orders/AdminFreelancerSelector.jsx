import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminFreelancersForAssignment } from "../../services/api";
import { SelectPanelBusySkeleton } from "../ui/Skeleton";
import "./AdminFreelancerSelector.css";

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0][0] || "";
  const b = (parts[1] && parts[1][0]) || (parts[0][1] || "");
  return (a + b).toUpperCase();
}

function subscriptionBadge(f) {
  const sub = f?.subscription;
  if (!sub?.status) return { label: "بدون اشتراك", tone: "warn" };
  const st = String(sub.status);
  if (st === "active" || st === "assigned_not_started") return { label: st === "active" ? "اشتراك نشط" : "اشتراك (لم يبدأ)", tone: "ok" };
  return { label: `اشتراك: ${st}`, tone: "warn" };
}

/**
 * @param {{
 *   active: boolean;
 *   value: string;
 *   selectedFreelancer: object | null;
 *   onChange: (next: { assignedFreelancerId: string; assignedFreelancer: object | null }) => void;
 *   disabled?: boolean;
 * }} props
 */
export default function AdminFreelancerSelector({ active, value, selectedFreelancer, onChange, disabled = false }) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [freelancers, setFreelancers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(String(searchInput).trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError("");
    try {
      const res = await getAdminFreelancersForAssignment({
        search: debouncedSearch,
        limit: 50,
        status: "all",
        eligibleOnly: false,
      });
      const list = res?.data?.freelancers;
      setFreelancers(Array.isArray(list) ? list : []);
    } catch (e) {
      setFreelancers([]);
      setError(e?.response?.data?.message || e?.message || "تعذر تحميل قائمة المستقلين.");
    } finally {
      setLoading(false);
    }
  }, [active, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedId = String(value || "").trim();
  const displaySelected = useMemo(() => {
    if (!selectedId) return null;
    if (selectedFreelancer && String(selectedFreelancer.id) === selectedId) return selectedFreelancer;
    return freelancers.find((f) => String(f.id) === selectedId) || null;
  }, [selectedId, selectedFreelancer, freelancers]);

  const pickUnassigned = () => {
    onChange({ assignedFreelancerId: "", assignedFreelancer: null });
  };

  const pickFreelancer = (f) => {
    if (!f?.assignable) return;
    onChange({ assignedFreelancerId: String(f.id), assignedFreelancer: f });
  };

  if (!active) return null;

  return (
    <div className="oh-admin-fl-sel" dir="rtl">
      {displaySelected ? (
        <div className="oh-admin-fl-sel__selected">
          <div className="oh-admin-fl-sel__selected-avatar" aria-hidden="true">
            {displaySelected.avatarUrl ? (
              <img src={displaySelected.avatarUrl} alt="" />
            ) : (
              initialsFromName(displaySelected.displayName || displaySelected.fullName)
            )}
          </div>
          <div className="oh-admin-fl-sel__selected-meta">
            <div className="oh-admin-fl-sel__selected-name">{displaySelected.displayName || displaySelected.fullName}</div>
            <div className="oh-admin-fl-sel__selected-sub" dir="ltr" style={{ textAlign: "right" }}>
              {displaySelected.accountId != null ? `#${displaySelected.accountId}` : "—"} · {displaySelected.email || "—"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="oh-admin-fl-sel__search">
        <input
          className="input"
          type="search"
          disabled={disabled}
          value={searchInput}
          placeholder="ابحث باسم المستقل أو البريد أو رقم الحساب..."
          onChange={(e) => setSearchInput(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="help oh-admin-fl-sel__hint">
        يمكن اختيار مستقل مؤهل فقط. المستقلون غير المؤهلين يظهرون مع السبب ولا يمكن اختيارهم.
      </div>

      <button type="button" className="btn btn-secondary oh-admin-fl-sel__unassign" disabled={disabled} onClick={pickUnassigned}>
        بدون تعيين
      </button>

      {loading ? (
        <div className="oh-admin-fl-sel__loading" aria-busy="true">
          <SelectPanelBusySkeleton />
        </div>
      ) : null}

      {error ? (
        <div className="oh-admin-fl-sel__error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && freelancers.length === 0 ? (
        <div className="oh-admin-fl-sel__empty">لا يوجد مستقلون مطابقون للبحث.</div>
      ) : null}

      {!loading && !error && freelancers.length > 0 ? (
        <div className="oh-admin-fl-sel__panel" role="listbox" aria-label="نتائج المستقلين">
          {freelancers.map((f) => {
            const subBadge = subscriptionBadge(f);
            const activeRow = selectedId === String(f.id);
            return (
              <button
                key={String(f.id)}
                type="button"
                role="option"
                aria-selected={activeRow}
                disabled={disabled || !f.assignable}
                className={`oh-admin-fl-sel__row ${!f.assignable ? "oh-admin-fl-sel__row--disabled" : ""} ${
                  activeRow ? "oh-admin-fl-sel__row--active" : ""
                }`.trim()}
                onClick={() => pickFreelancer(f)}
              >
                <div className="oh-admin-fl-sel__row-avatar" aria-hidden="true">
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    initialsFromName(f.displayName)
                  )}
                </div>
                <div className="oh-admin-fl-sel__row-body">
                  <div className="oh-admin-fl-sel__row-name">{f.displayName || f.fullName}</div>
                  <div className="oh-admin-fl-sel__row-line" dir="ltr" style={{ textAlign: "right" }}>
                    حساب: {f.accountId != null ? f.accountId : "—"} · {f.email || "—"}
                  </div>
                  <div className="oh-admin-fl-sel__badges">
                    <span
                      className={`oh-admin-fl-sel__badge ${f.status === "active" ? "oh-admin-fl-sel__badge--ok" : "oh-admin-fl-sel__badge--err"}`.trim()}
                    >
                      {f.status === "active" ? "حساب نشط" : "حساب غير نشط"}
                    </span>
                    <span className={`oh-admin-fl-sel__badge oh-admin-fl-sel__badge--${subBadge.tone}`.trim()}>{subBadge.label}</span>
                    {!f.assignable && f.ineligibleReason ? (
                      <span className="oh-admin-fl-sel__badge oh-admin-fl-sel__badge--err">{f.ineligibleReason}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
