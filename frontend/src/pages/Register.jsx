import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../constants/authRoutes";

const CATEGORY_OPTIONS = [
  { slug: "design", label: "تصميم" },
  { slug: "content_writing", label: "كتابة محتوى" },
  { slug: "development", label: "البرمجة" },
];

const COUNTRY_CACHE_KEY = "orderz_countries_cache_v3";
const COUNTRY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const ARAB_COUNTRY_CODES = new Set([
  "SA", // Saudi Arabia
  "AE", // United Arab Emirates
  "KW", // Kuwait
  "QA", // Qatar
  "BH", // Bahrain
  "OM", // Oman
  "JO", // Jordan
  "PS", // Palestine
  "LB", // Lebanon
  "SY", // Syria
  "IQ", // Iraq
  "EG", // Egypt
  "LY", // Libya
  "TN", // Tunisia
  "DZ", // Algeria
  "MA", // Morocco
  "SD", // Sudan
  "MR", // Mauritania
  "YE", // Yemen
  "SO", // Somalia
  "DJ", // Djibouti
  "KM", // Comoros
]);

function iso2ToFlag(iso2) {
  const code = String(iso2 || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const a = 0x1f1e6;
  const first = code.codePointAt(0) - 65 + a;
  const second = code.codePointAt(1) - 65 + a;
  return String.fromCodePoint(first, second);
}

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

function safeDialCode(country) {
  const root = country?.idd?.root;
  const suffix = Array.isArray(country?.idd?.suffixes) ? country.idd.suffixes[0] : "";
  const dial = `${root || ""}${suffix || ""}`.trim();
  return /^\+\d{1,4}$/.test(dial) ? dial : "";
}

function getArabicCountryName(country) {
  // Arabic-only UI: no English fallback
  return country?.translations?.ara?.common || country?.translations?.ara?.official || "";
}

function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const onDown = (e) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [ref, handler]);
}

function PremiumSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  ltr = false,
  id,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useOnClickOutside(wrapRef, () => setOpen(false));

  const selected = options.find((o) => o.value === value) || null;

  const commit = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className={`auth-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${ltr ? "auth-ltr" : ""}`}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Escape") setOpen(false);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <button
        type="button"
        id={id}
        className="auth-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className={`auth-select__text ${selected ? "" : "is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="auth-select__chev" aria-hidden="true" />
      </button>

      {open ? (
        <div className="auth-select__panel" role="listbox" aria-labelledby={id}>
          <div className="auth-select__options">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`auth-select__opt ${o.value === value ? "is-selected" : ""}`}
                role="option"
                aria-selected={o.value === value}
                onClick={() => commit(o.value)}
              >
                <span className="auth-select__opt-text">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function fetchCountries() {
  const cachedRaw = localStorage.getItem(COUNTRY_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached?.at && Date.now() - cached.at < COUNTRY_CACHE_TTL_MS && Array.isArray(cached?.items)) {
        return cached.items;
      }
    } catch {
      // ignore cache parse errors
    }
  }

  const res = await fetch(
    "https://restcountries.com/v3.1/all?fields=cca2,name,translations,idd",
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error("COUNTRIES_FETCH_FAILED");
  }
  const json = await res.json();
  const items = (Array.isArray(json) ? json : [])
    .map((c) => {
      const code = String(c?.cca2 || "").toUpperCase();
      const nameAr = getArabicCountryName(c);
      const dialCode = safeDialCode(c);
      const flag = iso2ToFlag(code);
      return { code, nameAr, dialCode, flag };
    })
    .filter((c) => c.code && c.nameAr && ARAB_COUNTRY_CODES.has(c.code))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  try {
    localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch {
    // ignore quota
  }
  return items;
}

const API_ERROR_AR = {
  "First name is required.": "الاسم الأول مطلوب.",
  "Father name is required.": "اسم الأب مطلوب.",
  "Family name is required.": "اسم العائلة مطلوب.",
  "First name must be Arabic letters only.": "الاسم الأول يجب أن يكون بالعربية فقط.",
  "Father name must be Arabic letters only.": "اسم الأب يجب أن يكون بالعربية فقط.",
  "Family name must be Arabic letters only.": "اسم العائلة يجب أن يكون بالعربية فقط.",
  "First name is too long.": "الاسم الأول طويل جداً.",
  "Father name is too long.": "اسم الأب طويل جداً.",
  "Family name is too long.": "اسم العائلة طويل جداً.",
  "Email is required.": "البريد الإلكتروني مطلوب.",
  "Invalid email format.": "صيغة البريد الإلكتروني غير صحيحة.",
  "Password is required.": "كلمة المرور مطلوبة.",
  "Password must be between 8 and 128 characters.": "كلمة المرور يجب أن تكون بين 8 و 128 حرفاً.",
  "Password must include at least one letter.": "كلمة المرور يجب أن تحتوي حرفاً إنجليزياً واحداً على الأقل.",
  "Password must include at least one number.": "كلمة المرور يجب أن تحتوي رقماً واحداً على الأقل.",
  "Passwords do not match.": "تأكيد كلمة المرور غير مطابق.",
  "Account type must be client or freelancer.": "نوع الحساب يجب أن يكون عميلاً أو مستقلاً.",
  "Country is required.": "الدولة مطلوبة.",
  "Country must be a 2-letter code.": "اختر الدولة من القائمة.",
  "Country must be an allowed Arab country.": "اختر دولة عربية من القائمة.",
  "Phone country code is required.": "اختر مفتاح الدولة لرقم الهاتف.",
  "Invalid phone country code.": "مفتاح الدولة لرقم الهاتف غير صالح.",
  "Phone country code must be an allowed Arab country code.": "اختر مفتاح دولة عربي لرقم الهاتف.",
  "Phone number is required.": "رقم الهاتف مطلوب.",
  "Invalid phone number.": "رقم الهاتف غير صالح.",
  "Phone must include country code in international format (e.g. +9665xxxxxxxx).":
    "رقم الهاتف غير صالح. تأكد من اختيار مفتاح الدولة وكتابة الرقم بشكل صحيح.",
  "WhatsApp country code is required.": "اختر مفتاح الدولة لرقم واتساب.",
  "Invalid WhatsApp country code.": "مفتاح الدولة لرقم واتساب غير صالح.",
  "WhatsApp country code must be an allowed Arab country code.": "اختر مفتاح دولة عربي لرقم واتساب.",
  "WhatsApp number is required.": "رقم واتساب مطلوب.",
  "Invalid WhatsApp number.": "رقم واتساب غير صالح.",
  "WhatsApp must include country code in international format (e.g. +9665xxxxxxxx).":
    "رقم واتساب غير صالح. تأكد من اختيار مفتاح الدولة وكتابة الرقم بشكل صحيح.",
  "Invalid gender value.": "قيمة غير صالحة للجنس.",
  "You must accept the terms and conditions.": "يجب الموافقة على الشروط والأحكام.",
  "Categories are only allowed for freelancer accounts.": "التصنيفات مسموحة لحساب المستقل فقط.",
  "Select at least one category.": "اختر تصنيفاً واحداً على الأقل.",
  "Invalid category selection.": "اختيار تصنيف غير صالح.",
  "Invalid account type.": "نوع الحساب غير صالح.",
  "Registration could not be completed.": "تعذر إكمال التسجيل. حاول مجدداً.",
  "This email is already registered.": "هذا البريد مسجّل مسبقاً.",
  "Database schema is missing the users table. Run backend/sql/init.sql against your database, then try again.":
    "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم أو أعد تهيئة قاعدة البيانات.",
  "Database schema does not match the application. Re-run backend/sql/init.sql or migrate your database.":
    "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم أو حدّث مخطط قاعدة البيانات.",
  "Database schema is missing required tables. New DB: run sql/init.sql (npm run db:init from backend). Then run npm run db:migrate for RBAC, plans, and subscriptions.":
    "قاعدة البيانات غير مكتملة. نفّذ تهيئة القاعدة ثم شغّل npm run db:migrate من مجلد backend.",
  "Database schema does not match the application. Re-run sql/init.sql if needed, then npm run db:migrate from the backend directory.":
    "مخطط قاعدة البيانات غير متطابق. حدّث القاعدة ثم شغّل npm run db:migrate من مجلد backend.",
};

function registerErrorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  if (apiMsg) {
    if (API_ERROR_AR[apiMsg]) return API_ERROR_AR[apiMsg];
    const raw = String(apiMsg);
    const rawLower = raw.toLowerCase();
    if (rawLower.includes("column") || rawLower.includes("schema")) {
      return "يوجد مشكلة في قاعدة البيانات. تواصل مع الدعم.";
    }
    return apiMsg;
  }
  if (err?.message?.includes("Network")) {
    return "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.";
  }
  return "تعذر إنشاء الحساب. راجع الحقول وحاول مجدداً.";
}

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("client");
  const [country, setCountry] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [whatsAppCountryCode, setWhatsAppCountryCode] = useState("");
  const [whatsAppNumber, setWhatsAppNumber] = useState("");
  const [gender, setGender] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const visualContent = {
    title: "أنشئ حضورك المهني بثقة",
    description:
      "ابدأ حسابك في أوردرز هاوس للوصول إلى فرص أكثر وتنظيم الطلبات والتواصل مع فريقك بشكل احترافي.",
    quote: "منصة مرتبة وسهلة الاستخدام، خلّت متابعة الطلبات بيني وبين العملاء أوضح بكثير.",
    personName: "ريم خالد",
    personRole: "صاحبة متجر رقمي",
  };

  const isFreelancer = accountType === "freelancer";

  useEffect(() => {
    let cancelled = false;
    setCountriesLoading(true);
    setCountriesError("");
    (async () => {
      try {
        const items = await fetchCountries();
        if (!cancelled) {
          setCountries(items);
        }
      } catch {
        if (!cancelled) {
          setCountriesError("تعذر تحميل قائمة الدول. يمكنك المحاولة لاحقاً دون أن تتعطل الصفحة.");
        }
      } finally {
        if (!cancelled) {
          setCountriesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dialCodeOptions = useMemo(() => {
    return countries
      .filter((c) => c.dialCode)
      .map((c) => ({
        value: c.dialCode,
        label: `${c.flag ? `${c.flag} ` : ""}${c.dialCode} — ${c.nameAr}`,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [countries]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.code, label: c.nameAr })),
    [countries],
  );

  const accountTypeOptions = useMemo(
    () => [
      { value: "client", label: "عميل" },
      { value: "freelancer", label: "مستقل" },
    ],
    [],
  );

  const genderOptions = useMemo(
    () => [
      { value: "ذكر", label: "ذكر" },
      { value: "أنثى", label: "أنثى" },
    ],
    [],
  );

  const ARABIC_ONLY = /^[\u0600-\u06FF\s]+$/;

  const step1Error = useMemo(() => {
    if (!firstName.trim()) return "أدخل الاسم الأول.";
    if (!fatherName.trim()) return "أدخل اسم الأب.";
    if (!familyName.trim()) return "أدخل اسم العائلة.";
    if (!ARABIC_ONLY.test(firstName.trim())) return "الاسم الأول يجب أن يكون بالعربية فقط.";
    if (!ARABIC_ONLY.test(fatherName.trim())) return "اسم الأب يجب أن يكون بالعربية فقط.";
    if (!ARABIC_ONLY.test(familyName.trim())) return "اسم العائلة يجب أن يكون بالعربية فقط.";
    if (!email.trim()) return "أدخل البريد الإلكتروني.";
    if (password.length < 8) return "كلمة المرور يجب ألا تقل عن 8 أحرف.";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return "كلمة المرور يجب أن تحتوي حرفاً ورقماً على الأقل.";
    }
    if (password !== confirmPassword) return "تأكيد كلمة المرور غير مطابق.";
    if (!["client", "freelancer"].includes(accountType)) return "اختر نوع الحساب.";
    return null;
  }, [firstName, fatherName, familyName, email, password, confirmPassword, accountType]);

  const step2Error = useMemo(() => {
    if (!country) return "اختر الدولة.";
    if (countriesError) return "تعذر تحميل الدول حالياً. حاول مجدداً بعد قليل.";
    if (!phoneCountryCode) return "اختر مفتاح الدولة لرقم الهاتف.";
    if (!normalizePhonePart(phoneNumber)) return "أدخل رقم الهاتف.";
    if (!/^\d{4,14}$/.test(normalizePhonePart(phoneNumber))) return "رقم الهاتف غير صالح.";
    if (!whatsAppCountryCode) return "اختر مفتاح الدولة لرقم واتساب.";
    if (!normalizePhonePart(whatsAppNumber)) return "أدخل رقم واتساب.";
    if (!/^\d{4,14}$/.test(normalizePhonePart(whatsAppNumber))) return "رقم واتساب غير صالح.";
    if (!gender) return "اختر الجنس.";
    if (!["ذكر", "أنثى"].includes(gender)) return "قيمة غير صالحة للجنس.";
    if (isFreelancer && categories.length === 0) return "اختر تصنيفاً واحداً على الأقل للمستقل.";
    if (!termsAccepted) return "يجب الموافقة على الشروط والأحكام.";
    return null;
  }, [
    country,
    countriesError,
    phoneCountryCode,
    phoneNumber,
    whatsAppCountryCode,
    whatsAppNumber,
    gender,
    isFreelancer,
    categories.length,
    termsAccepted,
  ]);

  const toggleCategory = (slug) => {
    setCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const localErr = step === 1 ? step1Error : step2Error;
    if (localErr) return setError(localErr);
    if (step === 1) return setStep(2);

    const body = {
      firstName: firstName.trim(),
      fatherName: fatherName.trim(),
      familyName: familyName.trim(),
      email: email.trim().toLowerCase(),
      password,
      confirmPassword,
      accountType,
      country,
      phone: {
        countryCode: phoneCountryCode,
        number: normalizePhonePart(phoneNumber),
      },
      whatsApp: {
        countryCode: whatsAppCountryCode,
        number: normalizePhonePart(whatsAppNumber),
      },
      gender,
      termsAccepted,
    };
    if (isFreelancer) {
      body.categories = categories;
    }

    setSubmitting(true);
    try {
      const user = await register(body);
      const role = user?.primaryRole || user?.role;
      navigate(getDashboardPath(role), { replace: true });
    } catch (err) {
      setError(registerErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title="إنشاء حساب جديد"
        subtitle="ابدأ استخدام أوردرز هاوس بخطوات بسيطة"
        footerText="لديك حساب بالفعل؟"
        footerLinkText="تسجيل الدخول"
        footerLinkTo="/login"
      >
        <form className="auth-form-grid" onSubmit={handleSubmit} noValidate>
          {error ? <p className="auth-form-error">{error}</p> : null}

          <div className="auth-steps">
            <button
              type="button"
              className={`auth-step ${step === 1 ? "is-active" : ""}`}
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              <span className="auth-step__num">1</span>
              <span className="auth-step__label">معلومات الحساب</span>
            </button>
            <div className={`auth-step-divider ${step === 2 ? "is-done" : ""}`} aria-hidden="true" />
            <button
              type="button"
              className={`auth-step ${step === 2 ? "is-active" : ""}`}
              onClick={() => {
                const err = step1Error;
                if (err) return setError(err);
                setError("");
                setStep(2);
              }}
              disabled={submitting}
            >
              <span className="auth-step__num">2</span>
              <span className="auth-step__label">الملف والتواصل</span>
            </button>
          </div>

          {step === 1 ? (
            <>
          <div className="auth-row auth-row--3">
            <label className="auth-field">
              <span>الاسم الأول</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="text"
                  placeholder="الاسم الأول"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>اسم الأب</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="text"
                  placeholder="اسم الأب"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>اسم العائلة</span>
              <div className="auth-input-wrap auth-input-wrap--noicon">
                <input
                  type="text"
                  placeholder="اسم العائلة"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>
          </div>

          <label className="auth-field">
            <span>البريد الإلكتروني</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>كلمة المرور</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>تأكيد كلمة المرور</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <input
                type="password"
                placeholder="********"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>نوع الحساب</span>
            <PremiumSelect
              id="register-account-type"
              value={accountType}
              onChange={(v) => {
                setAccountType(v);
                setCategories([]);
              }}
              placeholder="اختر نوع الحساب"
              options={accountTypeOptions}
              disabled={submitting}
            />
          </label>

          <div className="auth-actions-row">
            <Button type="submit" className="auth-submit-btn" disabled={submitting}>
              التالي
            </Button>
          </div>
            </>
          ) : (
            <>
              <label className="auth-field">
                <span>الدولة</span>
                <PremiumSelect
                  id="register-country"
                  value={country}
                  onChange={setCountry}
                  placeholder={countriesLoading ? "جاري تحميل الدول…" : "اختر الدولة"}
                  options={countryOptions}
                  disabled={submitting || countriesLoading}
                />
                {countriesError ? <span className="auth-field-hint auth-field-hint--warn">{countriesError}</span> : null}
              </label>

              <div className="auth-field">
                <span>رقم الهاتف</span>
                <div className="auth-split-row">
                  <label className="auth-split-item">
                    <span className="auth-sr-only">مفتاح الدولة</span>
                    <PremiumSelect
                      id="register-phone-cc"
                      value={phoneCountryCode}
                      onChange={setPhoneCountryCode}
                      placeholder={countriesLoading ? "..." : "+الرمز"}
                      options={dialCodeOptions}
                      disabled={submitting || countriesLoading}
                      ltr
                    />
                  </label>
                  <label className="auth-split-item">
                    <span className="auth-sr-only">الرقم</span>
                    <div className="auth-input-wrap auth-input-wrap--noicon auth-ltr">
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="5xxxxxxxx"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div className="auth-field">
                <span>رقم واتساب</span>
                <div className="auth-split-row">
                  <label className="auth-split-item">
                    <span className="auth-sr-only">مفتاح الدولة</span>
                    <PremiumSelect
                      id="register-wa-cc"
                      value={whatsAppCountryCode}
                      onChange={setWhatsAppCountryCode}
                      placeholder={countriesLoading ? "..." : "+الرمز"}
                      options={dialCodeOptions}
                      disabled={submitting || countriesLoading}
                      ltr
                    />
                  </label>
                  <label className="auth-split-item">
                    <span className="auth-sr-only">الرقم</span>
                    <div className="auth-input-wrap auth-input-wrap--noicon auth-ltr">
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="5xxxxxxxx"
                        value={whatsAppNumber}
                        onChange={(e) => setWhatsAppNumber(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </label>
                </div>
              </div>

              <label className="auth-field">
                <span>الجنس</span>
                <PremiumSelect
                  id="register-gender"
                  value={gender}
                  onChange={setGender}
                  placeholder="اختر الجنس"
                  options={genderOptions}
                  disabled={submitting}
                />
              </label>

              {isFreelancer ? (
                <div className="auth-field">
                  <span>التصنيفات (اختر واحداً أو أكثر)</span>
                  <div className="auth-categories">
                    {CATEGORY_OPTIONS.map(({ slug, label }) => (
                      <label key={slug} className="auth-category-item">
                        <input
                          type="checkbox"
                          checked={categories.includes(slug)}
                          onChange={() => toggleCategory(slug)}
                          disabled={submitting}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="auth-field auth-field--checkbox">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  disabled={submitting}
                />
                <span className="auth-terms-text">
                  أوافق على{" "}
                  <Link to="/terms-conditions" className="auth-inline-link" target="_blank" rel="noreferrer">
                    الشروط والأحكام
                  </Link>{" "}
                  و
                  <Link to="/privacy-policy" className="auth-inline-link" target="_blank" rel="noreferrer">
                    سياسة الخصوصية
                  </Link>
                </span>
              </label>

              <div className="auth-actions-row auth-actions-row--split">
                <Button
                  type="button"
                  variant="secondary"
                  className="auth-nav-btn"
                  onClick={() => {
                    setError("");
                    setStep(1);
                  }}
                  disabled={submitting}
                >
                  السابق
                </Button>
                <Button type="submit" className="auth-submit-btn" disabled={submitting || Boolean(step2Error)}>
                  {submitting ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
                </Button>
              </div>
            </>
          )}
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Register;
