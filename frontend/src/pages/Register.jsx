import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../constants/authRoutes";
import { resendRegisterOtpRequest } from "../services/api";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";

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
      dir={ltr ? "ltr" : undefined}
      className={[tw.authSelectRoot, ltr ? tw.authSelectLtrRoot : ""].filter(Boolean).join(" ")}
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
        className={[tw.authSelectBtn, ltr ? tw.authSelectBtnLtr : "", open ? tw.authSelectBtnOpen : ""]
          .filter(Boolean)
          .join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span
          className={[tw.authSelectText, !selected ? tw.authSelectPlaceholder : ""].filter(Boolean).join(" ")}
        >
          {selected ? selected.label : placeholder}
        </span>
        <span
          className={[tw.authSelectChev, open ? tw.authSelectChevOpen : ""].filter(Boolean).join(" ")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className={tw.authSelectPanel} role="listbox" aria-labelledby={id}>
          <div className={tw.authSelectOptions}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={[
                  tw.authSelectOpt,
                  ltr ? tw.authSelectOptLtr : "",
                  o.value === value ? tw.authSelectOptSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="option"
                aria-selected={o.value === value}
                onClick={() => commit(o.value)}
              >
                <span className={tw.authSelectOptText}>{o.label}</span>
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

function registerErrorMessage(err) {
  return getSafeApiErrorMessage(err, "تعذر إنشاء الحساب. راجع الحقول وحاول مجدداً.");
}

const Register = () => {
  const { register, completeRegisterWithOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
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
    if (resendCooldown <= 0) return undefined;
    const t = window.setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

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

  const handleResendOtp = async () => {
    setError("");
    try {
      await resendRegisterOtpRequest(email.trim().toLowerCase());
      setResendCooldown(60);
    } catch (err) {
      setError(registerErrorMessage(err));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (showOtpStep) {
      const code = otp.trim();
      if (!/^\d{6}$/.test(code)) {
        setError("أدخل رمز التحقق المكوّن من 6 أرقام.");
        return;
      }
      setSubmitting(true);
      try {
        const user = await completeRegisterWithOtp(email.trim().toLowerCase(), code);
        const role = user?.primaryRole || user?.role;
        navigate(getDashboardPath(role), { replace: true });
      } catch (err) {
        setError(registerErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
      const result = await register(body);
      if (result?.requiresEmailVerification) {
        setShowOtpStep(true);
        setOtp("");
        setResendCooldown(60);
        return;
      }
      const user = result;
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
        title={showOtpStep ? "تأكيد البريد الإلكتروني" : "إنشاء حساب جديد"}
        subtitle={
          showOtpStep
            ? `أدخل الرمز المكوّن من 6 أرقام المرسل إلى ${email.trim() || "بريدك"}`
            : "ابدأ استخدام أوردرز هاوس بخطوات بسيطة"
        }
        footerText="لديك حساب بالفعل؟"
        footerLinkText="تسجيل الدخول"
        footerLinkTo="/login"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          {showOtpStep ? (
            <>
              <p className={tw.authHelperText} style={{ margin: 0 }}>
                أهلاً بك في أوردرز هاوس. الرمز صالح لمدة 10 دقائق.
              </p>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>رمز التحقق</span>
                <div className={`${tw.authInputWrap} ${tw.authLtr}`}>
                  <input
                    className={tw.authInputNoIcon}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={submitting}
                  />
                </div>
              </label>
              <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                {submitting ? "جارٍ التحقق..." : "تأكيد الحساب"}
              </Button>
              <Button
                unstyled
                type="button"
                className={tw.authNavBtn}
                style={{ width: "100%" }}
                disabled={submitting || resendCooldown > 0}
                onClick={handleResendOtp}
              >
                {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ث` : "إعادة إرسال الرمز"}
              </Button>
              <button
                type="button"
                className={tw.authSubtleLink}
                style={{ background: "none", border: "none", cursor: "pointer", width: "100%" }}
                disabled={submitting}
                onClick={() => {
                  setShowOtpStep(false);
                  setOtp("");
                  setError("");
                }}
              >
                تعديل بيانات التسجيل
              </button>
            </>
          ) : (
            <>
              <div className={tw.authSteps}>
            <button
              type="button"
              className={[tw.authStep, step === 1 ? tw.authStepActive : ""].filter(Boolean).join(" ")}
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              <span className={tw.authStepNum}>1</span>
              <span className={tw.authStepLabel}>معلومات الحساب</span>
            </button>
            <div
              className={[tw.authStepDivider, step === 2 ? tw.authStepDividerDone : ""].filter(Boolean).join(" ")}
              aria-hidden="true"
            />
            <button
              type="button"
              className={[tw.authStep, step === 2 ? tw.authStepActive : ""].filter(Boolean).join(" ")}
              onClick={() => {
                const err = step1Error;
                if (err) return setError(err);
                setError("");
                setStep(2);
              }}
              disabled={submitting}
            >
              <span className={tw.authStepNum}>2</span>
              <span className={tw.authStepLabel}>الملف والتواصل</span>
            </button>
          </div>

          {step === 1 ? (
            <>
          <div className={`${tw.authRow} ${tw.authRow3}`}>
            <label className={tw.authField}>
              <span className={tw.authFieldLabel}>الاسم الأول</span>
              <div className={tw.authInputWrap}>
                <input
                  className={tw.authInputNoIcon}
                  type="text"
                  placeholder="الاسم الأول"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className={tw.authField}>
              <span className={tw.authFieldLabel}>اسم الأب</span>
              <div className={tw.authInputWrap}>
                <input
                  className={tw.authInputNoIcon}
                  type="text"
                  placeholder="اسم الأب"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>

            <label className={tw.authField}>
              <span className={tw.authFieldLabel}>اسم العائلة</span>
              <div className={tw.authInputWrap}>
                <input
                  className={tw.authInputNoIcon}
                  type="text"
                  placeholder="اسم العائلة"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </label>
          </div>

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>البريد الإلكتروني</span>
            <div className={tw.authInputWrap}>
              <input
                className={tw.authInputNoIcon}
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={submitting}
              />
            </div>
          </label>

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>كلمة المرور</span>
            <div className={tw.authInputWrap}>
              <input
                className={tw.authInputNoIcon}
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
          </label>

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>تأكيد كلمة المرور</span>
            <div className={tw.authInputWrap}>
              <input
                className={tw.authInputNoIcon}
                type="password"
                placeholder="********"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
          </label>

          <label className={tw.authField}>
            <span className={tw.authFieldLabel}>نوع الحساب</span>
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

          <div className={tw.authActionsRow}>
            <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
              التالي
            </Button>
          </div>
            </>
          ) : (
            <>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>الدولة</span>
                <PremiumSelect
                  id="register-country"
                  value={country}
                  onChange={setCountry}
                  placeholder={countriesLoading ? "جاري تحميل الدول…" : "اختر الدولة"}
                  options={countryOptions}
                  disabled={submitting || countriesLoading}
                />
                {countriesError ? (
                  <span className={`${tw.authFieldHint} ${tw.authFieldHintWarn}`}>{countriesError}</span>
                ) : null}
              </label>

              <div className={tw.authField}>
                <span className={tw.authFieldLabel}>رقم الهاتف</span>
                <div className={tw.authSplitRow}>
                  <label className={tw.authSplitItem}>
                    <span className={tw.authSrOnly}>مفتاح الدولة</span>
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
                  <label className={tw.authSplitItem}>
                    <span className={tw.authSrOnly}>الرقم</span>
                    <div className={`${tw.authInputWrap} ${tw.authLtr}`}>
                      <input
                        className={tw.authInputNoIcon}
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

              <div className={tw.authField}>
                <span className={tw.authFieldLabel}>رقم واتساب</span>
                <div className={tw.authSplitRow}>
                  <label className={tw.authSplitItem}>
                    <span className={tw.authSrOnly}>مفتاح الدولة</span>
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
                  <label className={tw.authSplitItem}>
                    <span className={tw.authSrOnly}>الرقم</span>
                    <div className={`${tw.authInputWrap} ${tw.authLtr}`}>
                      <input
                        className={tw.authInputNoIcon}
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

              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>الجنس</span>
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
                <div className={tw.authField}>
                  <span className={tw.authFieldLabel}>التصنيفات (اختر واحداً أو أكثر)</span>
                  <div className={tw.authCategories}>
                    {CATEGORY_OPTIONS.map(({ slug, label }) => (
                      <label key={slug} className={tw.authCategoryItem}>
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

              <label className={tw.authFieldCheckbox}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  disabled={submitting}
                />
                <span className={tw.authTermsText}>
                  أوافق على{" "}
                  <Link to="/terms-conditions" className={tw.authInlineLink} target="_blank" rel="noreferrer">
                    الشروط والأحكام
                  </Link>{" "}
                  و
                  <Link to="/privacy-policy" className={tw.authInlineLink} target="_blank" rel="noreferrer">
                    سياسة الخصوصية
                  </Link>
                </span>
              </label>

              <div className={`${tw.authActionsRow} ${tw.authActionsRowSplit}`}>
                <Button
                  unstyled
                  type="button"
                  className={tw.authNavBtn}
                  onClick={() => {
                    setError("");
                    setStep(1);
                  }}
                  disabled={submitting}
                >
                  السابق
                </Button>
                <Button
                  unstyled
                  type="submit"
                  className={tw.authSubmitBtn}
                  disabled={submitting || Boolean(step2Error)}
                >
                  {submitting ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
                </Button>
              </div>
            </>
          )}
            </>
          )}
        </form>
      </AuthFormCard>
    </AuthLayout>
  );
};

export default Register;
