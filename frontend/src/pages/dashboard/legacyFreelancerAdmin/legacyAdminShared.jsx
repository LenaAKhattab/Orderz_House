import { useEffect, useState } from "react";
import { fetchLegacyFreelancerIdentityBlob } from "../../../services/api";

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatMoney(amount, currency = "JOD") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-JO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function entryMethodLabel(method) {
  if (method === "ADMIN_MANUAL") return "إضافة يدوية";
  if (method === "SHARED_INVITE") return "دعوة مشتركة";
  return method || "—";
}

export function identityStatusLabel(identity) {
  if (!identity) return "غير مكتملة";
  if (identity.complete) return "مكتملة";
  if (identity.frontOk || identity.backOk) return "جزئية";
  return "غير مكتملة";
}

export function categoriesLabel(categories) {
  if (Array.isArray(categories) && categories.length) return categories.join("، ");
  if (typeof categories === "string" && categories.trim()) return categories;
  return "—";
}

export const PACKAGE_DURATION_OPTIONS = [1, 2, 3, 4, 6, 12];

export const CENTER_TABS = [
  { id: "freelancers", label: "الفريلانسرز القدامى" },
  { id: "campaigns", label: "حملات الدعوة" },
  { id: "documents", label: "الأوراق والعقود" },
  { id: "registration", label: "إعدادات التسجيل" },
];

function identityImageErrorMessage(err) {
  const fromApi = err?.response?.data?.message || err?.message;
  if (fromApi && typeof fromApi === "string") return fromApi;
  return "تعذر تحميل صورة الهوية الآن. حاول مرة أخرى.";
}

/** Blob-fetch identity preview (same pattern as activation KYC images). */
export function LegacyIdentityImage({ userId, side, label, refreshKey = 0 }) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    setSrc("");
    setErr("");
    if (!userId) return undefined;
    (async () => {
      try {
        const blob = await fetchLegacyFreelancerIdentityBlob(userId, side, {
          signal: controller.signal,
        });
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSrc(objectUrl);
      } catch (e) {
        if (!active || e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError") {
          return;
        }
        setErr(identityImageErrorMessage(e));
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, side, refreshKey]);

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-800">{label}</h4>
      {err ? <p className="text-sm text-red-700">{err}</p> : null}
      {src ? (
        <img
          src={src}
          alt={label}
          className="max-h-[360px] max-w-full rounded-lg border border-slate-200"
        />
      ) : !err ? (
        <p className="text-sm text-slate-500">جارٍ التحميل…</p>
      ) : null}
    </div>
  );
}
