import { useCallback, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/ToastContext.jsx";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/notificationsUiResources";
import { patchBrowserNotificationsRequest, postBrowserNotificationTestRequest } from "../../services/api";
import {
  getBrowserPermission,
  isBrowserNotificationSupported,
  permissionToStoredStatus,
  requestBrowserPermission,
  showBrowserNotification,
} from "../../services/browserNotifications";

export default function BrowserNotificationSettings() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const storedStatus = String(user?.browserNotificationStatus || "pending").toLowerCase();
  const supported = isBrowserNotificationSupported();
  const perm = supported ? getBrowserPermission() : "unsupported";

  const handleEnable = useCallback(async () => {
    if (!supported) {
      toast.error(t("notificationsUi.browser.toastUnsupported"));
      return;
    }
    setBusy(true);
    try {
      const next = await requestBrowserPermission();
      const status = permissionToStoredStatus(next);
      if (status === "accepted") {
        await patchBrowserNotificationsRequest({ status: "accepted" });
        await refreshUser();
        toast.success(t("notificationsUi.browser.toastEnabled"));
      } else {
        await patchBrowserNotificationsRequest({ status: "rejected" });
        await refreshUser();
        toast.error(t("notificationsUi.browser.toastDenied"));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t("notificationsUi.browser.toastEnableFailed"));
    } finally {
      setBusy(false);
    }
  }, [refreshUser, supported, t, toast]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    try {
      await patchBrowserNotificationsRequest({ status: "rejected" });
      await refreshUser();
      toast.success(t("notificationsUi.browser.toastDisabled"));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t("notificationsUi.browser.toastSaveFailed"));
    } finally {
      setBusy(false);
    }
  }, [refreshUser, t, toast]);

  const handleTest = useCallback(async () => {
    setBusy(true);
    try {
      if (perm !== "granted") {
        toast.error(t("notificationsUi.browser.toastNeedPermission"));
        return;
      }
      await postBrowserNotificationTestRequest();
      showBrowserNotification({
        title: t("notificationsUi.browser.testTitle"),
        body: t("notificationsUi.browser.testBody"),
        link: window.location.pathname,
        tag: "test",
      });
      toast.success(t("notificationsUi.browser.toastTestSent"));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t("notificationsUi.browser.toastTestFailed"));
    } finally {
      setBusy(false);
    }
  }, [perm, t, toast]);

  return (
    <div className="oh-account-card" style={{ marginBottom: 16 }}>
      <h2 className="oh-account-card__title">{t("notificationsUi.browser.title")}</h2>
      <p className="oh-account-value" style={{ marginBottom: 12, fontSize: "0.88rem", color: "#5a6378" }}>
        {t("notificationsUi.browser.intro")}
      </p>
      {!supported ? (
        <p className="oh-account-value">{t("notificationsUi.browser.unsupported")}</p>
      ) : (
        <>
          <p className="oh-account-value" style={{ marginBottom: 12 }}>
            {t("notificationsUi.browser.statusLabel")}{" "}
            <strong>
              {storedStatus === "accepted" && perm === "granted"
                ? t("notificationsUi.browser.enabled")
                : storedStatus === "rejected" || perm === "denied"
                  ? t("notificationsUi.browser.disabled")
                  : t("notificationsUi.browser.notRequested")}
            </strong>
          </p>
          <div className="oh-account-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="oh-account-btn-primary" disabled={busy} onClick={handleEnable}>
              {t("notificationsUi.browser.enableBtn")}
            </button>
            <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={handleDisable}>
              {t("notificationsUi.browser.disableBtn")}
            </button>
            <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={handleTest}>
              {t("notificationsUi.browser.testBtn")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
