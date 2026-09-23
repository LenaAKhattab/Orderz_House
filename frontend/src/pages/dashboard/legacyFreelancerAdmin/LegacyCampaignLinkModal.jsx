import { useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  getLegacyFreelancerInviteLinkRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
} from "../../../services/api";

/**
 * Modal: عرض / نسخ رابط الدعوة المشترك للحملة.
 */
export default function LegacyCampaignLinkModal({ campaign, onClose, onRegenerated }) {
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
          pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر جلب الرابط") });
          onClose?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, onClose, pushToast]);

  const copy = async () => {
    if (!payload?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(payload.joinUrl);
      pushToast({ type: "success", message: "تم نسخ الرابط" });
    } catch {
      pushToast({ type: "error", message: "تعذر النسخ — انسخ الرابط يدوياً" });
    }
  };

  const regenerate = async () => {
    if (!campaign?.id || busy) return;
    const ok = window.confirm(
      "إعادة توليد الرمز تُبطل الرابط السابق فوراً. هل تريد المتابعة؟",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await regenerateLegacyFreelancerInviteTokenRequest(campaign.id);
      const joinUrl = res?.data?.joinUrl || null;
      setPayload({
        recoverable: Boolean(joinUrl),
        joinUrl,
        message: joinUrl
          ? null
          : "تم إعادة التوليد لكن تعذر استرجاع الرابط — انسخه من الاستجابة إن ظهر.",
      });
      pushToast({ type: "success", message: "تم إعادة توليد الرابط — الرابط السابق باطل" });
      onRegenerated?.(res?.data);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إعادة التوليد") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="oh-legacy-link-modal" role="dialog" aria-modal="true" aria-labelledby="legacy-link-modal-title">
      <button type="button" className="oh-legacy-link-modal__backdrop" aria-label="إغلاق" onClick={onClose} />
      <div className="oh-legacy-link-modal__panel">
        <header className="oh-legacy-link-modal__head">
          <h3 id="legacy-link-modal-title">رابط الدعوة — {campaign?.name || "الحملة"}</h3>
          <button type="button" className="oh-legacy-link-modal__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        {loading ? (
          <p className="oh-legacy-link-modal__hint">جاري تحميل الرابط…</p>
        ) : payload?.recoverable && payload?.joinUrl ? (
          <div className="oh-legacy-link-modal__body">
            <label className="oh-legacy-link-modal__label" htmlFor="legacy-invite-url">
              الرابط الكامل
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
                نسخ
              </Button>
            </div>
            <div className="oh-legacy-admin__actions" style={{ marginTop: "0.85rem" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.open(payload.joinUrl, "_blank", "noopener,noreferrer")}
              >
                فتح الرابط
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={regenerate}>
                إعادة توليد token
              </Button>
            </div>
          </div>
        ) : (
          <div className="oh-legacy-link-modal__body">
            <p className="oh-legacy-link-modal__warn">
              {payload?.message ||
                "لا يمكن عرض الرابط الحالي لهذه الحملة لأنه أُنشئ قبل دعم استرجاع الرابط. يمكنك إعادة توليد الرابط مرة واحدة لتفعيل العرض والنسخ مستقبلاً."}
            </p>
            <Button type="button" disabled={busy} onClick={regenerate}>
              إعادة توليد الرابط الآن
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
