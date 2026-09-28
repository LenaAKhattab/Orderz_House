import { useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { useTranslation } from "../../../i18n/LanguageProvider";
import {
  getLegacyFreelancerInviteLinkRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
} from "../../../services/api";

export default function LegacyCampaignLinkModal({ campaign, onClose, onRegenerated }) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!campaign?.id) return;
      setLoading(true);
      try {
        const res = await getLegacyFreelancerInviteLinkRequest(campaign.id);
        if (!cancelled) setPayload(res?.data || null);
      } catch (err) {
        if (!cancelled) {
          pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.fetchLinkFailed")) });
          onClose?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, onClose, pushToast, t]);

  const copy = async () => {
    if (!payload?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(payload.joinUrl);
      pushToast({ type: "success", message: t("legacy.toast.linkCopied") });
    } catch {
      pushToast({ type: "error", message: t("legacy.toast.copyFailed") });
    }
  };

  const regenerate = async () => {
    if (!campaign?.id || busy) return;
    const ok = window.confirm(t("legacy.campaigns.confirmRegenerateImmediate"));
    if (!ok) return;
    setBusy(true);
    try {
      const res = await regenerateLegacyFreelancerInviteTokenRequest(campaign.id);
      const joinUrl = res?.data?.joinUrl || null;
      setPayload({
        recoverable: Boolean(joinUrl),
        joinUrl,
        message: joinUrl ? null : t("legacy.campaigns.regeneratePartial"),
      });
      pushToast({ type: "success", message: t("legacy.toast.linkRegenerated") });
      onRegenerated?.(res?.data);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.regenerateFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const titleName = campaign?.name || t("legacy.common.inviteLinkFallbackName");

  return (
    <div className="oh-legacy-link-modal" role="dialog" aria-modal="true" aria-labelledby="legacy-link-modal-title">
      <button type="button" className="oh-legacy-link-modal__backdrop" aria-label={t("legacy.common.close")} onClick={onClose} />
      <div className="oh-legacy-link-modal__panel">
        <header className="oh-legacy-link-modal__head">
          <h3 id="legacy-link-modal-title">{t("legacy.common.inviteLinkTitle", { name: titleName })}</h3>
          <button type="button" className="oh-legacy-link-modal__close" onClick={onClose} aria-label={t("legacy.common.close")}>
            ×
          </button>
        </header>

        {loading ? (
          <p className="oh-legacy-link-modal__hint">{t("legacy.common.loadingLink")}</p>
        ) : payload?.recoverable && payload?.joinUrl ? (
          <div className="oh-legacy-link-modal__body">
            <label className="oh-legacy-link-modal__label" htmlFor="legacy-invite-url">
              {t("legacy.common.fullLink")}
            </label>
            <div className="oh-legacy-link-modal__url-row">
              <input
                id="legacy-invite-url"
                className="oh-legacy-link-modal__url"
                dir="ltr"
                readOnly
                value={payload.joinUrl}
              />
              <Button type="button" onClick={copy}>
                {t("legacy.common.copy")}
              </Button>
            </div>
            <div className="oh-legacy-admin__actions" style={{ marginTop: "0.85rem" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.open(payload.joinUrl, "_blank", "noopener,noreferrer")}
              >
                {t("legacy.common.openLink")}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={regenerate}>
                {t("legacy.common.tokenRegenerate")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="oh-legacy-link-modal__body">
            <p className="oh-legacy-link-modal__warn">
              {payload?.message || t("legacy.campaigns.linkNotRecoverable")}
            </p>
            <Button type="button" disabled={busy} onClick={regenerate}>
              {t("legacy.common.regenerateLinkNow")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
