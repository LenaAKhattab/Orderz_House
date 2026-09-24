import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import LegacyRegistrationInstructions from "../components/auth/LegacyRegistrationInstructions";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../constants/authRoutes";
import {
  previewLegacyFreelancerInviteRequest,
  legacyFreelancerRegisterRequest,
} from "../services/api";
import { getAuthApiErrorMessage } from "../utils/apiErrorMessage";
import { ARAB_COUNTRIES, DEFAULT_DIAL_CODE } from "../constants/arabCountries";
import LegacyPhoneInput from "../components/legacy/LegacyPhoneInput";
import { toPhonePayload } from "../utils/legacyPhone";
import {
  LEGACY_WORK_FIELDS,
  WORK_FIELDS_REQUIRED_MESSAGE,
} from "../constants/legacyFreelancerWorkFields";

const fieldLabel = tw.authFieldLabel;
const fieldInput = tw.authInputNoIcon;

const SECTION_ORDER = ["personal", "address", "education", "skills", "study_work", "extra", "declaration"];

function conditionActive(rule, answers) {
  if (!rule?.fieldKey) return true;
  const v = answers[rule.fieldKey];
  if (typeof rule.equals === "boolean") {
    return v === true || v === "true" || v === "yes" || v === "نعم";
  }
  return String(v ?? "") === String(rule.equals);
}

function FieldInput({ field, value, onChange }) {
  const common = { className: fieldInput, id: `lf-${field.key}` };
  if (field.type === "textarea") {
    return (
      <textarea
        {...common}
        rows={3}
        required={field.required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        {...common}
        required={field.required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— اختر —</option>
        {(field.options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "yes_no") {
    return (
      <select
        {...common}
        required={field.required}
        value={value === true ? "yes" : value === false ? "no" : ""}
        onChange={(e) => onChange(e.target.value === "yes" ? true : e.target.value === "no" ? false : "")}
      >
        <option value="">— اختر —</option>
        <option value="yes">نعم</option>
        <option value="no">لا</option>
      </select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm font-normal">
        <input
          type="checkbox"
          checked={value === true}
          required={field.required}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.helper || field.label}</span>
      </label>
    );
  }
  const inputType = field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
  return (
    <input
      {...common}
      type={inputType}
      dir={field.type === "phone" || field.type === "number" ? "ltr" : undefined}
      required={field.required}
      value={value ?? ""}
      onChange={(e) => onChange(field.type === "number" ? e.target.value : e.target.value)}
    />
  );
}

export default function LegacyFreelancerJoinPage() {
  const { campaignSlug } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const { refreshUser, getDashboardPath: dashPath } = useAuth();

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [country, setCountry] = useState("JO");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [workFields, setWorkFields] = useState([]);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPreview(true);
      setPreviewError("");
      try {
        if (!token) throw new Error("رابط الدعوة غير مكتمل.");
        const res = await previewLegacyFreelancerInviteRequest(campaignSlug, token);
        if (!cancelled) {
          setPreview(res?.data || null);
          setAnswers({});
          setWorkFields([]);
          setIdFrontFile(null);
          setIdBackFile(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(getAuthApiErrorMessage(err, "تم إيقاف رابط الدعوة."));
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignSlug, token]);

  const formFields = useMemo(() => {
    const list = Array.isArray(preview?.formFields) ? preview.formFields : [];
    return [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [preview]);

  const sectionMeta = useMemo(() => {
    const map = {};
    for (const s of preview?.sections || []) {
      map[s.key] = s.label || s.key;
    }
    return map;
  }, [preview]);

  const visibleFields = useMemo(
    () => formFields.filter((f) => conditionActive(f.conditionalRule, answers)),
    [formFields, answers],
  );

  const sectionsWithFields = useMemo(() => {
    const grouped = {};
    for (const f of visibleFields) {
      const key = f.section || "extra";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
    const keys = [
      ...SECTION_ORDER.filter((k) => grouped[k]?.length),
      ...Object.keys(grouped).filter((k) => !SECTION_ORDER.includes(k)),
    ];
    return keys.map((key) => ({
      key,
      label: sectionMeta[key] || key,
      fields: grouped[key],
    }));
  }, [visibleFields, sectionMeta]);

  const setAnswer = (key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const toggleWorkField = (key, checked) => {
    setWorkFields((prev) => {
      const set = new Set(prev);
      if (checked) set.add(key);
      else set.delete(key);
      return [...set];
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");
    if (password !== passwordConfirm) {
      setFormError("تأكيد كلمة المرور غير مطابق.");
      return;
    }
    if (!termsAccepted || !privacyAccepted) {
      setFormError("يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.");
      return;
    }
    if (!workFields.length) {
      setFormError(WORK_FIELDS_REQUIRED_MESSAGE);
      return;
    }
    if (preview?.requireIdFront && !idFrontFile) {
      setFormError("صورة الهوية الأمامية مطلوبة.");
      return;
    }
    if (preview?.requireIdBack && !idBackFile) {
      setFormError("صورة الهوية الخلفية مطلوبة.");
      return;
    }
    setSubmitting(true);
    try {
      const payloadAnswers = {};
      for (const f of visibleFields) {
        if (Object.prototype.hasOwnProperty.call(answers, f.key)) {
          payloadAnswers[f.key] = answers[f.key];
        }
      }
      const phoneValue = toPhonePayload({ countryCode: phoneCountryCode, number: phoneNumber });
      const hasFiles = Boolean(idFrontFile || idBackFile);
      const basePayload = {
        campaignSlug,
        token,
        email,
        phone: phoneValue,
        password,
        passwordConfirm,
        country,
        firstName: payloadAnswers.first_name,
        fatherName: payloadAnswers.father_name,
        familyName: payloadAnswers.family_name,
        city: payloadAnswers.city,
        answers: payloadAnswers,
        workFields,
        termsAccepted: true,
        privacyAccepted: true,
      };

      let payload = basePayload;
      if (hasFiles) {
        const fd = new FormData();
        fd.append("campaignSlug", campaignSlug);
        fd.append("token", token);
        fd.append("email", email);
        fd.append("phone", JSON.stringify(phoneValue));
        fd.append("password", password);
        fd.append("passwordConfirm", passwordConfirm);
        fd.append("country", country);
        if (payloadAnswers.first_name) fd.append("firstName", String(payloadAnswers.first_name));
        if (payloadAnswers.father_name) fd.append("fatherName", String(payloadAnswers.father_name));
        if (payloadAnswers.family_name) fd.append("familyName", String(payloadAnswers.family_name));
        if (payloadAnswers.city) fd.append("city", String(payloadAnswers.city));
        fd.append("answers", JSON.stringify(payloadAnswers));
        fd.append("workFields", JSON.stringify(workFields));
        fd.append("termsAccepted", "true");
        fd.append("privacyAccepted", "true");
        if (idFrontFile) fd.append("idFront", idFrontFile);
        if (idBackFile) fd.append("idBack", idBackFile);
        payload = fd;
      }

      const res = await legacyFreelancerRegisterRequest(payload);
      setSuccess(res?.message || "تم إنشاء حسابك كفريلانسر معتمد سابقًا.");
      await refreshUser();
      const path = dashPath?.() || getDashboardPath("freelancer");
      setTimeout(() => navigate(path || "/dashboard/freelancer"), 600);
    } catch (err) {
      setFormError(getAuthApiErrorMessage(err, "تعذر إكمال التسجيل."));
    } finally {
      setSubmitting(false);
    }
  };

  const visualContent = {
    children: <LegacyRegistrationInstructions variant="visual" />,
  };

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title="تسجيل فريلانسر معتمد سابقًا"
        subtitle="هذا الرابط مخصص للفريلانسرز الذين تم اعتمادهم سابقًا من قبل الشركة. أكمل البيانات المطلوبة لإنشاء حسابك."
      >
        <div className="oh-legacy-instructions-mobile">
          <LegacyRegistrationInstructions variant="form" />
        </div>
        {loadingPreview ? (
          <p className={tw.authHelperText}>جاري التحقق من الرابط…</p>
        ) : previewError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{previewError}</div>
        ) : (
          <>
            {success ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {success}
              </div>
            ) : null}
            {formError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div>
            ) : null}

            <form className="flex flex-col gap-5" onSubmit={onSubmit}>
              {sectionsWithFields.map((section) => (
                <fieldset key={section.key} className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-800">{section.label}</legend>
                  <div className="mt-2 flex flex-col gap-3">
                    {section.fields.map((field) =>
                      field.type === "checkbox" ? (
                        <div key={field.key}>
                          <FieldInput
                            field={field}
                            value={answers[field.key]}
                            onChange={(v) => setAnswer(field.key, v)}
                          />
                        </div>
                      ) : (
                        <label key={field.key} className={fieldLabel}>
                          {field.label}
                          {field.required ? " *" : ""}
                          {field.helper ? (
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">{field.helper}</span>
                          ) : null}
                          <FieldInput
                            field={field}
                            value={answers[field.key]}
                            onChange={(v) => setAnswer(field.key, v)}
                          />
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
              ))}

              <fieldset className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">مجال العمل</legend>
                <p className="mt-1 text-xs text-slate-500">اختر مجال أو مجالات العمل التي تمارسها.</p>
                <div className="mt-2 flex flex-col gap-2">
                  {LEGACY_WORK_FIELDS.map((wf) => {
                    const checked = workFields.includes(wf.key);
                    return (
                      <label key={wf.key} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleWorkField(wf.key, e.target.checked)}
                        />
                        <span>{wf.labelAr}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {preview?.requireIdFront || preview?.requireIdBack ? (
                <fieldset className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-800">الهوية</legend>
                  <div className="mt-2 flex flex-col gap-3">
                    {preview?.requireIdFront ? (
                      <label className={fieldLabel}>
                        صورة الهوية (أمام) *
                        <input
                          className={fieldInput}
                          type="file"
                          accept="image/*"
                          required
                          onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    ) : null}
                    {preview?.requireIdBack ? (
                      <label className={fieldLabel}>
                        صورة الهوية (خلف) *
                        <input
                          className={fieldInput}
                          type="file"
                          accept="image/*"
                          required
                          onChange={(e) => setIdBackFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">حساب الدخول</legend>
                <div className="mt-2 flex flex-col gap-3">
                  <label className={fieldLabel}>
                    البريد الإلكتروني *
                    <input
                      className={fieldInput}
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <div className={tw.authField}>
                    <span className={fieldLabel} id="lf-phone-label">
                      رقم الهاتف *
                    </span>
                    <LegacyPhoneInput
                      id="lf-account-phone"
                      required
                      countryCode={phoneCountryCode}
                      number={phoneNumber}
                      onCountryCodeChange={setPhoneCountryCode}
                      onNumberChange={setPhoneNumber}
                      aria-labelledby="lf-phone-label"
                    />
                  </div>
                  <label className={fieldLabel}>
                    الدولة
                    <select className={fieldInput} value={country} onChange={(e) => setCountry(e.target.value)}>
                      {ARAB_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.nameAr || c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldLabel}>
                    كلمة المرور *
                    <input
                      className={fieldInput}
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label className={fieldLabel}>
                    تأكيد كلمة المرور *
                    <input
                      className={fieldInput}
                      type="password"
                      required
                      minLength={8}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>
                      أوافق على{" "}
                      <Link className={tw.authSubtleLink} to="/terms-conditions" target="_blank">
                        الشروط والأحكام
                      </Link>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    />
                    <span>
                      أوافق على{" "}
                      <Link className={tw.authSubtleLink} to="/privacy-policy" target="_blank">
                        سياسة الخصوصية
                      </Link>
                    </span>
                  </label>
                </div>
              </fieldset>

              <Button type="submit" disabled={submitting} className="mt-2 w-full">
                {submitting ? "جاري التسجيل…" : "إكمال التسجيل"}
              </Button>
            </form>
          </>
        )}
      </AuthFormCard>
    </AuthLayout>
  );
}
