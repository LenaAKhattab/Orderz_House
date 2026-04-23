import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import {
  createPlanRequest,
  deletePlanRequest,
  listAdminPlansRequest,
  updatePlanRequest,
} from "../../services/api";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  return apiMsg || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function normalizeCreatePayload(form) {
  return {
    name: form.name.trim(),
    title: form.title.trim(),
    description: form.description.trim() || null,
    durationDays: Number(form.durationDays),
    priceCents: form.priceCents === "" ? null : Number(form.priceCents),
    requiresCompanyVisit: Boolean(form.requiresCompanyVisit),
    isActive: Boolean(form.isActive),
    isVisible: Boolean(form.isVisible),
    sortOrder: Number(form.sortOrder),
  };
}

const SuperAdminPlansPage = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    title: "",
    description: "",
    durationDays: "30",
    priceCents: "",
    requiresCompanyVisit: false,
    isActive: true,
    isVisible: true,
    sortOrder: "0",
  });

  const canCreate = useMemo(() => {
    return form.name.trim().length >= 2 && form.title.trim().length >= 2 && Number(form.durationDays) > 0;
  }, [form.name, form.title, form.durationDays]);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await listAdminPlansRequest(false);
      setPlans(data?.data?.plans || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const createPlan = async () => {
    setError("");
    setSubmitting(true);
    try {
      await createPlanRequest(normalizeCreatePayload(form));
      setForm({
        name: "",
        title: "",
        description: "",
        durationDays: "30",
        priceCents: "",
        requiresCompanyVisit: false,
        isActive: true,
        isVisible: true,
        sortOrder: "0",
      });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (plan, field) => {
    setError("");
    setSubmitting(true);
    try {
      await updatePlanRequest(plan.id, { [field]: !plan[field] });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const softDelete = async (plan) => {
    setError("");
    setSubmitting(true);
    try {
      await deletePlanRequest(plan.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container page-content">
      <div className="card">
        <h1>إدارة الباقات</h1>
        <p>هذه الصفحة متاحة للمدير الأعلى فقط. الباقات ديناميكية من قاعدة البيانات.</p>
        {error ? <p className="auth-form-error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>إضافة باقة</h2>
        <div className="auth-form-grid" style={{ marginTop: 12 }}>
          <label className="auth-field">
            <span>الاسم الداخلي (name)</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                value={form.name}
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                placeholder="freelancer_pro"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>العنوان</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                value={form.title}
                onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                placeholder="باقتي الاحترافية"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>الوصف</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                value={form.description}
                onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                placeholder="وصف مختصر للباقه"
                disabled={submitting}
              />
            </div>
          </label>

          <div className="auth-row auth-row--3">
            <label className="auth-field">
              <span>المدة (أيام)</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={form.durationDays}
                  onChange={(e) => setForm((v) => ({ ...v, durationDays: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>السعر (cents) اختياري</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="number"
                  min="0"
                  value={form.priceCents}
                  onChange={(e) => setForm((v) => ({ ...v, priceCents: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>الترتيب</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((v) => ({ ...v, sortOrder: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </label>
          </div>

          <label className="auth-field auth-field--checkbox">
            <input
              type="checkbox"
              checked={form.requiresCompanyVisit}
              onChange={(e) => setForm((v) => ({ ...v, requiresCompanyVisit: e.target.checked }))}
              disabled={submitting}
            />
            <span>يتطلب زيارة الشركة</span>
          </label>

          <label className="auth-field auth-field--checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))}
              disabled={submitting}
            />
            <span>فعّالة</span>
          </label>

          <label className="auth-field auth-field--checkbox">
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(e) => setForm((v) => ({ ...v, isVisible: e.target.checked }))}
              disabled={submitting}
            />
            <span>مرئية</span>
          </label>

          <Button
            type="button"
            className="auth-submit-btn"
            disabled={submitting || !canCreate}
            onClick={createPlan}
          >
            إضافة الباقة
          </Button>
        </div>
      </div>

      <div className="card">
        <h2>قائمة الباقات</h2>
        {loading ? <AdminInlineGridSkeleton count={3} /> : null}
        {!loading && plans.length === 0 ? <p>لا توجد باقات بعد.</p> : null}
        {!loading && plans.length > 0 ? (
          <div className="cards-grid" style={{ marginTop: 12 }}>
            {plans.map((p) => (
              <article className="card" key={p.id}>
                <h3>{p.title}</h3>
                <p>name: {p.name}</p>
                <p>المدة: {p.durationDays} يوم</p>
                <p>زيارة الشركة: {p.requiresCompanyVisit ? "نعم" : "لا"}</p>
                <p>الحالة: {p.isActive ? "فعّالة" : "غير فعّالة"} / {p.isVisible ? "مرئية" : "مخفية"}</p>
                <div className="auth-actions-row auth-actions-row--split" style={{ marginTop: 10 }}>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => toggle(p, "isActive")}>
                    {p.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => toggle(p, "isVisible")}>
                    {p.isVisible ? "إخفاء" : "إظهار"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => toggle(p, "requiresCompanyVisit")}>
                    {p.requiresCompanyVisit ? "إلغاء الزيارة" : "يتطلب زيارة"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => softDelete(p)}>
                    حذف
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default SuperAdminPlansPage;

