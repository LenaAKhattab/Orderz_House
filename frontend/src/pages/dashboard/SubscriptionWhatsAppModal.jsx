import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardModal from "../../components/dashboard/DashboardModal";
import {
  buildSubscriptionWhatsAppMessage,
  getWhatsappFieldGroups,
  resolveFreelancerWhatsapp,
  DEFAULT_WHATSAPP_SELECTION,
} from "../../admin/subscriptions/subscriptionWhatsApp";
import { formatFreelancerDisplayName } from "../../admin/subscriptions/subscriptionAdminDisplay";

const fieldLabelClass = "text-xs font-bold text-slate-600";

function collectFieldIds(groups) {
  const ids = [];
  for (const group of groups) for (const field of group.fields) ids.push(field.id);
  return ids;
}

/**
 * WhatsApp message composer for a single PAID subscription. Builds a message from
 * selectable detail fields + custom text and opens WhatsApp — never sends automatically.
 */
export default function SubscriptionWhatsAppModal({ open, subscription, planTitle, onClose }) {
  const [selection, setSelection] = useState(DEFAULT_WHATSAPP_SELECTION);
  const [customText, setCustomText] = useState("");

  const groups = useMemo(
    () => (subscription ? getWhatsappFieldGroups(subscription, planTitle) : []),
    [subscription, planTitle],
  );

  const wa = useMemo(() => resolveFreelancerWhatsapp(subscription || {}), [subscription]);
  const recipientName = subscription ? formatFreelancerDisplayName(subscription) : "";

  useEffect(() => {
    if (open) {
      setSelection(DEFAULT_WHATSAPP_SELECTION);
      setCustomText("");
    }
  }, [open, subscription?.id]);

  const message = useMemo(
    () =>
      subscription
        ? buildSubscriptionWhatsAppMessage({ sub: subscription, planTitle, selection, customText })
        : "",
    [subscription, planTitle, selection, customText],
  );

  const toggle = (id) => setSelection((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectAll = () => {
    const next = {};
    for (const id of collectFieldIds(groups)) next[id] = true;
    setSelection(next);
  };

  const deselectAll = () => setSelection({});

  const openWhatsApp = () => {
    if (!wa.normalized) return;
    const text = message ? `?text=${encodeURIComponent(message)}` : "";
    const url = `https://wa.me/${wa.normalized}${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose?.();
  };

  return (
    <DashboardModal
      open={open}
      title="إرسال رسالة واتساب"
      ariaLabel="Send WhatsApp Message — إرسال رسالة واتساب"
      className="oh-sa-subs-wa-modal"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" variant="primary" disabled={!wa.normalized} onClick={openWhatsApp}>
            فتح واتساب
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm leading-relaxed text-slate-600">
          اختر البيانات التي تريد تضمينها في الرسالة، ثم أضف نصًا مخصصًا قبل فتح واتساب.
        </p>

        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3">
          <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{recipientName || "—"}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500" dir="ltr">
            {wa.raw || "لا يوجد رقم واتساب"}
          </div>
          {!wa.normalized ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
              لا يوجد رقم واتساب صالح لهذا المستخدم.
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={fieldLabelClass} htmlFor="sa-subs-wa-text">
            نص إضافي من الإدارة
          </label>
          <textarea
            id="sa-subs-wa-text"
            className="w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary,#2f3b65)]/20"
            rows={3}
            value={customText}
            placeholder="اكتب رسالة أو ملاحظة إضافية هنا..."
            onChange={(e) => setCustomText(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={selectAll}>
            تحديد الكل
          </Button>
          <Button type="button" variant="secondary" onClick={deselectAll}>
            إلغاء تحديد الكل
          </Button>
        </div>

        <div className="grid gap-3">
          {groups.map((group) => (
            <fieldset key={group.id} className="m-0 rounded-2xl border border-slate-200/90 p-3">
              <legend className="px-1 text-xs font-black text-slate-700">{group.title}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.fields.map((field) => {
                  const hasValue = Boolean(String(field.value || "").trim());
                  return (
                    <label
                      key={field.id}
                      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm ${
                        hasValue ? "text-slate-700" : "text-slate-400"
                      }`}
                      title={hasValue ? "" : "لا توجد قيمة"}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[color:var(--primary,#2f3b65)]"
                        checked={Boolean(selection[field.id])}
                        disabled={!hasValue}
                        onChange={() => toggle(field.id)}
                      />
                      <span className="min-w-0 truncate">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>معاينة الرسالة</span>
          <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            {message || "لم يتم اختيار أي بيانات بعد."}
          </div>
        </div>
      </div>
    </DashboardModal>
  );
}
