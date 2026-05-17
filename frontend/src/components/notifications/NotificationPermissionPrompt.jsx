import { useCallback, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { patchBrowserNotificationsRequest } from "../../services/api";
import {
  isBrowserNotificationSupported,
  permissionToStoredStatus,
  requestBrowserPermission,
} from "../../services/browserNotifications";
import { shouldPromptForBrowserNotifications } from "../../utils/notificationPreferenceRules";
import "./notification-permission.css";

export default function NotificationPermissionPrompt() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const visible = shouldPromptForBrowserNotifications(user) && !dismissed;

  const saveStatus = useCallback(
    async (status) => {
      await patchBrowserNotificationsRequest({ status });
      await refreshUser();
    },
    [refreshUser],
  );

  const handleAccept = useCallback(async () => {
    if (!isBrowserNotificationSupported()) {
      setDismissed(true);
      return;
    }
    setBusy(true);
    try {
      const perm = await requestBrowserPermission();
      const status = permissionToStoredStatus(perm);
      await saveStatus(status === "pending" ? "rejected" : status);
    } catch {
      await saveStatus("rejected");
    } finally {
      setBusy(false);
      setDismissed(true);
    }
  }, [saveStatus]);

  const handleDecline = useCallback(async () => {
    setBusy(true);
    try {
      await saveStatus("rejected");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setDismissed(true);
    }
  }, [saveStatus]);

  if (!visible) return null;

  return (
    <div className="notif-perm-backdrop" role="presentation">
      <div className="notif-perm-modal" role="dialog" aria-labelledby="notif-perm-title" aria-modal="true">
        <div className="notif-perm-modal__icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3a5 5 0 0 0-5 5v2.3c0 .95-.3 1.87-.85 2.65L4.6 15.1a1 1 0 0 0 .82 1.57h13.16a1 1 0 0 0 .82-1.57l-1.55-2.15A4.6 4.6 0 0 1 17 10.3V8a5 5 0 0 0-5-5Z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </svg>
        </div>
        <h2 id="notif-perm-title" className="notif-perm-modal__title">
          تفعيل إشعارات الموقع
        </h2>
        <p className="notif-perm-modal__text">
          احصل على تنبيهات فورية للطلبات والدفع والتسليم حتى عندما تكون في تبويب آخر. يمكنك تغيير ذلك لاحقاً من الإعدادات.
        </p>
        <div className="notif-perm-modal__actions">
          <button type="button" className="notif-perm-modal__btn notif-perm-modal__btn--primary" disabled={busy} onClick={handleAccept}>
            {busy ? "جاري…" : "تفعيل الإشعارات"}
          </button>
          <button type="button" className="notif-perm-modal__btn notif-perm-modal__btn--ghost" disabled={busy} onClick={handleDecline}>
            ليس الآن
          </button>
        </div>
      </div>
    </div>
  );
}
