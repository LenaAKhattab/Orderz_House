import { useCallback, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/ToastContext.jsx";
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
  const [busy, setBusy] = useState(false);

  const storedStatus = String(user?.browserNotificationStatus || "pending").toLowerCase();
  const supported = isBrowserNotificationSupported();
  const perm = supported ? getBrowserPermission() : "unsupported";

  const handleEnable = useCallback(async () => {
    if (!supported) {
      toast.error("المتصفح لا يدعم إشعارات سطح المكتب.");
      return;
    }
    setBusy(true);
    try {
      const next = await requestBrowserPermission();
      const status = permissionToStoredStatus(next);
      if (status === "accepted") {
        await patchBrowserNotificationsRequest({ status: "accepted" });
        await refreshUser();
        toast.success("تم تفعيل إشعارات المتصفح.");
      } else {
        await patchBrowserNotificationsRequest({ status: "rejected" });
        await refreshUser();
        toast.error("لم يتم منح الإذن. يمكنك تفعيله من إعدادات المتصفح.");
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "تعذّر التفعيل.");
    } finally {
      setBusy(false);
    }
  }, [refreshUser, supported, toast]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    try {
      await patchBrowserNotificationsRequest({ status: "rejected" });
      await refreshUser();
      toast.success("تم إيقاف إشعارات المتصفح من التطبيق. قد تحتاج أيضاً لتعطيلها من إعدادات المتصفح.");
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }, [refreshUser, toast]);

  const handleTest = useCallback(async () => {
    setBusy(true);
    try {
      if (perm !== "granted") {
        toast.error("فعّل إذن الإشعارات من المتصفح أولاً.");
        return;
      }
      await postBrowserNotificationTestRequest();
      showBrowserNotification({
        title: "إشعار تجريبي",
        body: "إذا ظهر هذا التنبيه، فإشعارات المتصفح تعمل بشكل صحيح.",
        link: window.location.pathname,
        tag: "test",
      });
      toast.success("تم إرسال إشعار تجريبي.");
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "تعذّر الإرسال.");
    } finally {
      setBusy(false);
    }
  }, [perm, toast]);

  return (
    <div className="oh-account-card" style={{ marginBottom: 16 }}>
      <h2 className="oh-account-card__title">إشعارات المتصفح</h2>
      <p className="oh-account-value" style={{ marginBottom: 12, fontSize: "0.88rem", color: "#5a6378" }}>
        تظهر تنبيهات سطح المكتب عند وصول إشعار جديد وأنت مسجّل الدخول. الإشعارات داخل الموقع (الجرس) تبقى تعمل دائماً.
      </p>
      {!supported ? (
        <p className="oh-account-value">متصفحك لا يدعم إشعارات سطح المكتب.</p>
      ) : (
        <>
          <p className="oh-account-value" style={{ marginBottom: 12 }}>
            الحالة:{" "}
            <strong>
              {storedStatus === "accepted" && perm === "granted"
                ? "مفعّلة"
                : storedStatus === "rejected" || perm === "denied"
                  ? "معطّلة"
                  : "لم يُطلب بعد"}
            </strong>
          </p>
          <div className="oh-account-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="oh-account-btn-primary" disabled={busy} onClick={handleEnable}>
              تفعيل إشعارات المتصفح
            </button>
            <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={handleDisable}>
              إيقاف من التطبيق
            </button>
            <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={handleTest}>
              إشعار تجريبي
            </button>
          </div>
        </>
      )}
    </div>
  );
}
