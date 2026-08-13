import { useCallback, useEffect, useState } from "react";
import {
  getFreelancerPantryRequestRequest,
  listFreelancerPantryMyWorkRequest,
  listFreelancerPantryRequestsRequest,
  submitFreelancerPantryBidRequest,
  submitFreelancerPantryDeliveryRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./pantryPages.css";

const STATUS_LABELS = {
  open_for_bids: "مفتوح للعروض",
  assigned: "مُسند إليك",
  in_progress: "قيد التنفيذ",
  submitted: "تم التسليم",
  revision_requested: "مطلوب تعديل",
  approved: "جاهز في بيت المونة",
  archived: "مؤرشف",
};

export default function FreelancerPantryPage() {
  const toast = useToast();
  const [tab, setTab] = useState("open");
  const [openRequests, setOpenRequests] = useState([]);
  const [myWork, setMyWork] = useState([]);
  const [selected, setSelected] = useState(null);
  const [bidForm, setBidForm] = useState({ amount: "", durationDays: "", message: "" });
  const [deliveryForm, setDeliveryForm] = useState({ message: "", fileUrl: "", fileName: "" });

  const reload = useCallback(async () => {
    try {
      const [openRes, workRes] = await Promise.all([
        listFreelancerPantryRequestsRequest(),
        listFreelancerPantryMyWorkRequest(),
      ]);
      setOpenRequests(openRes?.data?.requests || []);
      setMyWork(workRes?.data?.requests || []);
    } catch (err) {
      toast?.error?.(err?.response?.data?.message || "تعذر تحميل طلبات بيت المونة");
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openRequest = async (id) => {
    try {
      const res = await getFreelancerPantryRequestRequest(id);
      setSelected(res?.data || null);
      setBidForm({ amount: "", durationDays: "", message: "" });
      setDeliveryForm({ message: "", fileUrl: "", fileName: "" });
    } catch (err) {
      toast?.error?.(err?.response?.data?.message || "تعذر فتح الطلب");
    }
  };

  const submitBid = async (e) => {
    e.preventDefault();
    try {
      await submitFreelancerPantryBidRequest(selected.request.id, {
        amount: Number(bidForm.amount),
        durationDays: bidForm.durationDays ? Number(bidForm.durationDays) : null,
        message: bidForm.message || null,
      });
      toast?.success?.("تم تقديم العرض");
      await reload();
      await openRequest(selected.request.id);
    } catch (err) {
      toast?.error?.(err?.response?.data?.message || "فشل تقديم العرض");
    }
  };

  const submitDelivery = async (e) => {
    e.preventDefault();
    const files = [];
    if (deliveryForm.fileUrl.trim()) {
      files.push({
        fileUrl: deliveryForm.fileUrl.trim(),
        fileName: deliveryForm.fileName.trim() || "file",
      });
    }
    try {
      await submitFreelancerPantryDeliveryRequest(selected.request.id, {
        message: deliveryForm.message || null,
        files,
      });
      toast?.success?.("تم تسليم العمل");
      await reload();
      setSelected(null);
      setTab("mine");
    } catch (err) {
      toast?.error?.(err?.response?.data?.message || "فشل التسليم");
    }
  };

  const list = tab === "open" ? openRequests : myWork;

  return (
    <div className="pantry-page" dir="rtl">
      <header className="pantry-page__header">
        <div>
          <h1>طلبات بيت المونة</h1>
          <p>
            أعمال داخلية للشركة — منفصلة تمامًا عن «الطلبات المتاحة» الخاصة بطلبات العملاء.
          </p>
        </div>
      </header>

      <div className="pantry-page__tabs">
        <button type="button" className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")}>
          الطلبات المفتوحة
        </button>
        <button type="button" className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")}>
          أعمالي في بيت المونة
        </button>
      </div>

      <div className="pantry-cards">
        {list.map((row) => (
          <article key={row.id} className="pantry-card">
            <h3>{row.title}</h3>
            <p className="muted">{STATUS_LABELS[row.status] || row.status}</p>
            <p className="muted">
              {row.pricingType === "bidding" ? "استقبال عروض" : "ميزانية ثابتة"}
              {row.fixedBudget != null ? ` · ${row.fixedBudget}` : ""}
              {row.deliveryDays != null ? ` · ${row.deliveryDays} يوم` : ""}
            </p>
            <p>{row.description?.slice(0, 160)}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openRequest(row.id)}>
              التفاصيل
            </button>
          </article>
        ))}
        {!list.length && (
          <p className="muted">
            {tab === "open"
              ? "لا توجد طلبات مفتوحة في بيت المونة حاليًا. إن كنت تبحث عن طلبات العملاء، افتح «الطلبات المتاحة» من القائمة."
              : "لا توجد أعمال مسندة إليك في بيت المونة بعد."}
          </p>
        )}
      </div>

      {selected?.request && (
        <div className="pantry-modal" role="dialog">
          <div className="pantry-modal__card">
            <h2>{selected.request.title}</h2>
            <p>{selected.request.description}</p>
            {selected.request.requirements && <p className="muted">متطلبات: {selected.request.requirements}</p>}
            {!!selected.request.skills?.length && (
              <p className="muted">مهارات: {selected.request.skills.join("، ")}</p>
            )}
            <p className="muted">
              {selected.request.pricingType === "bidding" ? "استقبال عروض" : "ميزانية ثابتة"}
              {selected.request.fixedBudget != null ? ` · ميزانية: ${selected.request.fixedBudget}` : ""}
              {selected.request.budgetMin != null || selected.request.budgetMax != null
                ? ` · نطاق: ${selected.request.budgetMin ?? "—"}–${selected.request.budgetMax ?? "—"}`
                : ""}
              {selected.request.deliveryDays != null ? ` · مدة: ${selected.request.deliveryDays} يوم` : ""}
            </p>
            <p>
              الحالة: <strong>{STATUS_LABELS[selected.request.status] || selected.request.status}</strong>
            </p>

            {selected.request.status === "open_for_bids" && !selected.myBid && (
              <form onSubmit={submitBid} className="pantry-form">
                <h3>تقديم عرض</h3>
                <label>
                  المبلغ
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={bidForm.amount}
                    onChange={(e) => setBidForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </label>
                <label>
                  المدة بالأيام
                  <input
                    type="number"
                    min="1"
                    value={bidForm.durationDays}
                    onChange={(e) => setBidForm((f) => ({ ...f, durationDays: e.target.value }))}
                  />
                </label>
                <label>
                  رسالة
                  <textarea
                    rows={3}
                    value={bidForm.message}
                    onChange={(e) => setBidForm((f) => ({ ...f, message: e.target.value }))}
                  />
                </label>
                <button type="submit" className="btn btn-primary">
                  تقديم عرض
                </button>
              </form>
            )}

            {selected.myBid && (
              <p className="muted">
                عرضك: {selected.myBid.amount} — {selected.myBid.status}
              </p>
            )}

            {["assigned", "in_progress", "revision_requested"].includes(selected.request.status) && (
              <form onSubmit={submitDelivery} className="pantry-form">
                <h3>تسليم العمل</h3>
                <label>
                  رسالة التسليم
                  <textarea
                    rows={3}
                    value={deliveryForm.message}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, message: e.target.value }))}
                  />
                </label>
                <label>
                  رابط الملف (اختياري)
                  <input
                    value={deliveryForm.fileUrl}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, fileUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  اسم الملف
                  <input
                    value={deliveryForm.fileName}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, fileName: e.target.value }))}
                  />
                </label>
                <button type="submit" className="btn btn-primary">
                  تسليم العمل
                </button>
              </form>
            )}

            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
