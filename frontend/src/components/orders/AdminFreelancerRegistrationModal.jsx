import { useEffect, useState } from "react";
import { adminGetFreelancerRegistrationRequest } from "../../services/api";
import { useToast } from "../ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";

function formatJoDateTime(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function Row({ label, value, dir }) {
  return (
    <div className="oh-review__row" style={{ alignItems: "flex-start" }}>
      <div className="oh-review__k" style={{ minWidth: 140 }}>
        {label}
      </div>
      <div className="oh-review__v" dir={dir || "rtl"}>
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

export default function AdminFreelancerRegistrationModal({ open, freelancerUserId, onClose }) {
  const { push } = useToast();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!open || !freelancerUserId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminGetFreelancerRegistrationRequest(freelancerUserId);
        const p = res?.data?.profile;
        if (!cancelled) setProfile(p || null);
      } catch (e) {
        if (!cancelled) {
          setProfile(null);
          push({
            type: "error",
            title: t("opsAdmin.freelancerRegModal.loadErrorTitle"),
            message: e?.response?.data?.message || e?.message || t("opsAdmin.freelancerRegModal.genericError"),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, freelancerUserId, push, t]);

  if (!open) return null;

  const fullName = profile
    ? [profile.firstName, profile.fatherName, profile.familyName].filter(Boolean).join(" ").trim()
    : "";

  const categoriesText = Array.isArray(profile?.freelancerCategories)
    ? profile.freelancerCategories.filter(Boolean).join(t("opsAdmin.common.listJoiner"))
    : "";

  const yesNo = (flag) => (flag ? t("opsAdmin.common.yes") : t("opsAdmin.common.no"));

  return (
    <div
      role="presentation"
      className="client-order-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div className="client-order-modal" role="dialog" aria-modal="true" aria-labelledby="admin-fl-reg-title" dir="rtl" onMouseDown={(ev) => ev.stopPropagation()}>
        <header className="client-order-modal__head">
          <div>
            <h2 id="admin-fl-reg-title" className="client-order-modal__title">
              {t("opsAdmin.freelancerRegModal.title")}
            </h2>
            <p className="client-order-modal__lead">{t("opsAdmin.freelancerRegModal.lead")}</p>
          </div>
          <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => !loading && onClose?.()} disabled={loading}>
            {t("opsAdmin.common.close")}
          </button>
        </header>

        <div className="client-order-modal__body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {loading ? (
            <p className="help">{t("opsAdmin.freelancerRegModal.loading")}</p>
          ) : profile ? (
            <div className="oh-review" style={{ marginTop: 0 }}>
              <Row label={t("opsAdmin.freelancerRegModal.accountId")} value={profile.accountId} dir="ltr" />
              <Row label={t("opsAdmin.freelancerRegModal.fullName")} value={fullName || "—"} />
              <Row label={t("opsAdmin.freelancerRegModal.email")} value={profile.email} dir="ltr" />
              <Row label={t("opsAdmin.freelancerRegModal.country")} value={profile.country} dir="ltr" />
              <Row label={t("opsAdmin.freelancerRegModal.phone")} value={profile.phone} dir="ltr" />
              <Row label={t("opsAdmin.freelancerRegModal.whatsapp")} value={profile.whatsapp} dir="ltr" />
              <Row label={t("opsAdmin.freelancerRegModal.gender")} value={profile.gender} />
              <Row label={t("opsAdmin.freelancerRegModal.termsAccepted")} value={yesNo(profile.termsAccepted)} />
              <Row label={t("opsAdmin.freelancerRegModal.categories")} value={categoriesText || "—"} />
              <Row label={t("opsAdmin.freelancerRegModal.isActive")} value={yesNo(profile.isActive)} />
              <Row label={t("opsAdmin.freelancerRegModal.registeredAt")} value={formatJoDateTime(profile.createdAt, locale)} />
            </div>
          ) : (
            <p className="help">{t("opsAdmin.freelancerRegModal.noData")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
