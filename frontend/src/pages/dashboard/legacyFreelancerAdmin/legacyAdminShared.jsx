import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
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

export function entryMethodLabel(method, t) {
  if (method === "ADMIN_MANUAL") return t("legacy.entryMethod.adminManual");
  if (method === "SHARED_INVITE") return t("legacy.entryMethod.sharedInvite");
  return method || "—";
}

export function identityStatusLabel(identity, t) {
  if (!identity) return t("legacy.common.incomplete");
  if (identity.complete) return t("legacy.common.complete");
  if (identity.frontOk || identity.backOk) return t("legacy.common.partial");
  return t("legacy.common.incomplete");
}

export function categoriesLabel(categories) {
  if (Array.isArray(categories) && categories.length) return categories.join("، ");
  if (typeof categories === "string" && categories.trim()) return categories;
  return "—";
}

export const PACKAGE_DURATION_OPTIONS = [1, 2, 3, 4, 6, 12];

export function getCenterTabs(t) {
  return [
    { id: "freelancers", label: t("legacy.center.tabs.freelancers") },
    { id: "campaigns", label: t("legacy.center.tabs.campaigns") },
    { id: "documents", label: t("legacy.center.tabs.documents") },
    { id: "registration", label: t("legacy.center.tabs.registration") },
  ];
}

export function getDetailTabs(t) {
  return [
    { id: "profile", label: t("legacy.detailTabs.profile") },
    { id: "identity", label: t("legacy.detailTabs.identity") },
    { id: "docs", label: t("legacy.detailTabs.docs") },
    { id: "package", label: t("legacy.detailTabs.package") },
    { id: "money", label: t("legacy.detailTabs.money") },
  ];
}

export function getWorkspaceTabs(t) {
  return [
    { id: "overview", label: t("legacy.common.overview") },
    { id: "registrants", label: t("legacy.common.registrants") },
    { id: "settings", label: t("legacy.common.campaignSettings") },
    { id: "documents", label: t("legacy.common.docsAndRegistration") },
  ];
}

function identityImageErrorMessage(err, t) {
  const fromApi = err?.response?.data?.message || err?.message;
  if (fromApi && typeof fromApi === "string") return fromApi;
  return t("legacy.toast.identityImageFailed");
}

/** Blob-fetch identity preview (same pattern as activation KYC images). */
export function LegacyIdentityImage({ userId, side, label, refreshKey = 0 }) {
  const { t } = useTranslation();
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
        setErr(identityImageErrorMessage(e, t));
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, side, refreshKey, t]);

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
        <p className="text-sm text-slate-500">{t("legacy.common.loadingShort")}</p>
      ) : null}
    </div>
  );
}
