import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
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

const CATEGORY_OPTIONS = [
  { value: "design", label: "التصميم" },
  { value: "content_writing", label: "كتابة المحتوى" },
  { value: "development", label: "البرمجة" },
];

const fieldLabel = tw.authFieldLabel;
const fieldInput = tw.authInputNoIcon;

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

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [specialty, setSpecialty] = useState("content_writing");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("JO");
  const [gender, setGender] = useState("ذكر");
  const [identityLast4, setIdentityLast4] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPreview(true);
      setPreviewError("");
      try {
        if (!token) {
          throw new Error("رابط الدعوة غير مكتمل.");
        }
        const res = await previewLegacyFreelancerInviteRequest(campaignSlug, token);
        if (!cancelled) setPreview(res?.data || null);
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
    setSubmitting(true);
    try {
      const res = await legacyFreelancerRegisterRequest({
        campaignSlug,
        token,
        fullName,
        email,
        phone: { countryCode: dial, number: phoneNumber },
        password,
        passwordConfirm,
        specialty,
        categories: [specialty],
        city: city || undefined,
        country,
        gender,
        identityLast4: identityLast4 || undefined,
        internalReference: internalReference || undefined,
        termsAccepted: true,
        privacyAccepted: true,
      });
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

  return (
    <AuthLayout>
      <AuthFormCard
        title="تسجيل فريلانسر معتمد سابقًا"
        subtitle="هذا الرابط مخصص للفريلانسرز الذين تم اعتمادهم سابقًا من قبل الشركة. اختر بيانات دخولك وأكمل التسجيل."
      >
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

            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
              <label className={fieldLabel}>
                الاسم الكامل
                <input className={fieldInput} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </label>
              <label className={fieldLabel}>
                البريد الإلكتروني
                <input
                  className={fieldInput}
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <label className={fieldLabel}>
                  مفتاح
                  <select className={fieldInput} value={dial} onChange={(e) => setDial(e.target.value)} dir="ltr">
                    {ARAB_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.dialCode}>
                        {c.dialCode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabel}>
                  رقم الهاتف
                  <input
                    className={fieldInput}
                    required
                    dir="ltr"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </label>
              </div>
              <label className={fieldLabel}>
                كلمة المرور
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
                تأكيد كلمة المرور
                <input
                  className={fieldInput}
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                />
              </label>
              <label className={fieldLabel}>
                التخصص / التصنيف
                <select className={fieldInput} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={fieldLabel}>
                  المدينة (اختياري)
                  <input className={fieldInput} value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
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
              </div>
              <label className={fieldLabel}>
                الجنس
                <select className={fieldInput} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </label>
              <label className={fieldLabel}>
                آخر 4 أرقام من الهوية (اختياري)
                <input
                  className={fieldInput}
                  dir="ltr"
                  maxLength={4}
                  value={identityLast4}
                  onChange={(e) => setIdentityLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </label>
              <label className={fieldLabel}>
                رقم مرجعي داخلي (اختياري)
                <input
                  className={fieldInput}
                  value={internalReference}
                  onChange={(e) => setInternalReference(e.target.value)}
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
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
