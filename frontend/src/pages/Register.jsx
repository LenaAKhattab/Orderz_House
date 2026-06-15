import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthFormCard from "../components/auth/AuthFormCard";
import AuthLayout from "../components/auth/AuthLayout";
import * as tw from "../components/auth/authTw";
import Button from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import { getDashboardPath } from "../constants/authRoutes";
import { useTranslation } from "../i18n/LanguageProvider";
import { resendRegisterOtpRequest } from "../services/api";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";
import { ARAB_COUNTRIES, DEFAULT_DIAL_CODE } from "../constants/arabCountries";

const CATEGORY_SLUGS = [
  { slug: "design", translationKey: "auth.register.categories.design" },
  { slug: "content_writing", translationKey: "auth.register.categories.contentWriting" },
  { slug: "development", translationKey: "auth.register.categories.development" },
];

const ARABIC_ONLY = /^[\u0600-\u06FF\s]+$/;

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
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

const Register = () => {
  const { register, completeRegisterWithOtp } = useAuth();
  const { t, locale } = useTranslation();
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
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const registerErrorMessage = (err) => getSafeApiErrorMessage(err, t("auth.register.error"));

  const visualContent = {
    title: t("auth.register.visualTitle"),
    description: t("auth.register.visualDesc"),
    quote: t("auth.register.visualQuote"),
    personName: t("auth.register.visualPersonName"),
    personRole: t("auth.register.visualPersonRole"),
  };

  const isFreelancer = accountType === "freelancer";

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale === "en" ? "en" : "ar"], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  const countryLabel = (code, nameAr) => {
    if (locale === "en" && regionNames) {
      return regionNames.of(code) || nameAr;
    }
    return nameAr;
  };

  const dialCodeOptions = useMemo(() => {
    return ARAB_COUNTRIES.map((c) => ({
      value: c.dialCode,
      label: `${c.flag ? `${c.flag} ` : ""}${c.dialCode} — ${countryLabel(c.code, c.nameAr)}`,
    })).sort((a, b) => {
      if (a.value === DEFAULT_DIAL_CODE) return -1;
      if (b.value === DEFAULT_DIAL_CODE) return 1;
      return a.value.localeCompare(b.value);
    });
  }, [locale, regionNames]);

  const countryOptions = useMemo(
    () => ARAB_COUNTRIES.map((c) => ({ value: c.code, label: countryLabel(c.code, c.nameAr) })),
    [locale, regionNames],
  );

  const accountTypeOptions = useMemo(
    () => [
      { value: "client", label: t("auth.register.accountTypes.client") },
      { value: "freelancer", label: t("auth.register.accountTypes.freelancer") },
    ],
    [t],
  );

  const genderOptions = useMemo(
    () => [
      { value: "ذكر", label: t("auth.register.gender.male") },
      { value: "أنثى", label: t("auth.register.gender.female") },
    ],
    [t],
  );

  const step1Error = useMemo(() => {
    if (!firstName.trim()) return t("auth.register.validation.firstNameRequired");
    if (!fatherName.trim()) return t("auth.register.validation.fatherNameRequired");
    if (!familyName.trim()) return t("auth.register.validation.familyNameRequired");
    if (!ARABIC_ONLY.test(firstName.trim())) return t("auth.register.validation.firstNameArabicOnly");
    if (!ARABIC_ONLY.test(fatherName.trim())) return t("auth.register.validation.fatherNameArabicOnly");
    if (!ARABIC_ONLY.test(familyName.trim())) return t("auth.register.validation.familyNameArabicOnly");
    if (!email.trim()) return t("auth.register.validation.emailRequired");
    if (password.length < 8) return t("auth.register.validation.passwordMin");
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return t("auth.register.validation.passwordComplexity");
    }
    if (password !== confirmPassword) return t("auth.register.validation.passwordMismatch");
    if (!["client", "freelancer"].includes(accountType)) return t("auth.register.validation.accountTypeRequired");
    return null;
  }, [firstName, fatherName, familyName, email, password, confirmPassword, accountType, t]);

  const step2Error = useMemo(() => {
    if (!country) return t("auth.register.validation.countryRequired");
    if (!phoneCountryCode) return t("auth.register.validation.phoneCountryCodeRequired");
    if (!normalizePhonePart(phoneNumber)) return t("auth.register.validation.phoneRequired");
    if (!/^\d{4,14}$/.test(normalizePhonePart(phoneNumber))) return t("auth.register.validation.phoneInvalid");
    if (!whatsAppCountryCode) return t("auth.register.validation.whatsappCountryCodeRequired");
    if (!normalizePhonePart(whatsAppNumber)) return t("auth.register.validation.whatsappRequired");
    if (!/^\d{4,14}$/.test(normalizePhonePart(whatsAppNumber))) return t("auth.register.validation.whatsappInvalid");
    if (!gender) return t("auth.register.validation.genderRequired");
    if (!["ذكر", "أنثى"].includes(gender)) return t("auth.register.validation.genderInvalid");
    if (isFreelancer && categories.length === 0) return t("auth.register.validation.categoriesRequired");
    if (!termsAccepted) return t("auth.register.validation.termsRequired");
    return null;
  }, [
    country,
    phoneCountryCode,
    phoneNumber,
    whatsAppCountryCode,
    whatsAppNumber,
    gender,
    isFreelancer,
    categories.length,
    termsAccepted,
    t,
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
        setError(t("auth.register.validation.otpRequired"));
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

  const otpSubtitle = t("auth.register.subtitleOtp", {
    email: email.trim() || t("auth.register.subtitleOtpFallback"),
  });

  return (
    <AuthLayout visualContent={visualContent}>
      <AuthFormCard
        title={showOtpStep ? t("auth.register.titleOtp") : t("auth.register.title")}
        subtitle={showOtpStep ? otpSubtitle : t("auth.register.subtitle")}
        footerText={t("auth.register.hasAccount")}
        footerLinkText={t("auth.register.loginLink")}
        footerLinkTo="/login"
      >
        <form className={tw.authFormGrid} onSubmit={handleSubmit} noValidate>
          {error ? <p className={tw.authFormError}>{error}</p> : null}

          {showOtpStep ? (
            <>
              <p className={tw.authHelperText} style={{ margin: 0 }}>
                {t("auth.register.otpWelcome")}
              </p>
              <label className={tw.authField}>
                <span className={tw.authFieldLabel}>{t("auth.register.otpLabel")}</span>
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
                {submitting ? t("auth.register.verifying") : t("auth.register.confirmAccount")}
              </Button>
              <Button
                unstyled
                type="button"
                className={tw.authNavBtn}
                style={{ width: "100%" }}
                disabled={submitting || resendCooldown > 0}
                onClick={handleResendOtp}
              >
                {resendCooldown > 0
                  ? t("auth.register.resendCooldown", { seconds: resendCooldown })
                  : t("auth.register.resend")}
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
                {t("auth.register.editRegistration")}
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
                  <span className={tw.authStepLabel}>{t("auth.register.steps.accountInfo")}</span>
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
                  <span className={tw.authStepLabel}>{t("auth.register.steps.profileContact")}</span>
                </button>
              </div>

              {step === 1 ? (
                <>
                  <div className={`${tw.authRow} ${tw.authRow3}`}>
                    <label className={tw.authField}>
                      <span className={tw.authFieldLabel}>{t("auth.register.fields.firstName")}</span>
                      <div className={tw.authInputWrap}>
                        <input
                          className={tw.authInputNoIcon}
                          type="text"
                          placeholder={t("auth.register.placeholders.firstName")}
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    </label>

                    <label className={tw.authField}>
                      <span className={tw.authFieldLabel}>{t("auth.register.fields.fatherName")}</span>
                      <div className={tw.authInputWrap}>
                        <input
                          className={tw.authInputNoIcon}
                          type="text"
                          placeholder={t("auth.register.placeholders.fatherName")}
                          value={fatherName}
                          onChange={(e) => setFatherName(e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    </label>

                    <label className={tw.authField}>
                      <span className={tw.authFieldLabel}>{t("auth.register.fields.familyName")}</span>
                      <div className={tw.authInputWrap}>
                        <input
                          className={tw.authInputNoIcon}
                          type="text"
                          placeholder={t("auth.register.placeholders.familyName")}
                          value={familyName}
                          onChange={(e) => setFamilyName(e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    </label>
                  </div>

                  <label className={tw.authField}>
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.email")}</span>
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
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.password")}</span>
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
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.confirmPassword")}</span>
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
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.accountType")}</span>
                    <PremiumSelect
                      id="register-account-type"
                      value={accountType}
                      onChange={(v) => {
                        setAccountType(v);
                        setCategories([]);
                      }}
                      placeholder={t("auth.register.placeholders.accountType")}
                      options={accountTypeOptions}
                      disabled={submitting}
                    />
                  </label>

                  <div className={tw.authActionsRow}>
                    <Button unstyled type="submit" className={tw.authSubmitBtn} disabled={submitting}>
                      {t("auth.register.buttons.next")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <label className={tw.authField}>
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.country")}</span>
                    <PremiumSelect
                      id="register-country"
                      value={country}
                      onChange={setCountry}
                      placeholder={t("auth.register.placeholders.country")}
                      options={countryOptions}
                      disabled={submitting}
                    />
                  </label>

                  <div className={tw.authField}>
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.phone")}</span>
                    <div className={tw.authSplitRow}>
                      <label className={tw.authSplitItem}>
                        <span className={tw.authSrOnly}>{t("auth.register.fields.countryCode")}</span>
                        <PremiumSelect
                          id="register-phone-cc"
                          value={phoneCountryCode}
                          onChange={setPhoneCountryCode}
                          placeholder={t("auth.register.placeholders.dialCode")}
                          options={dialCodeOptions}
                          disabled={submitting}
                          ltr
                        />
                      </label>
                      <label className={tw.authSplitItem}>
                        <span className={tw.authSrOnly}>{t("auth.register.fields.phoneNumber")}</span>
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
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.whatsapp")}</span>
                    <div className={tw.authSplitRow}>
                      <label className={tw.authSplitItem}>
                        <span className={tw.authSrOnly}>{t("auth.register.fields.countryCode")}</span>
                        <PremiumSelect
                          id="register-wa-cc"
                          value={whatsAppCountryCode}
                          onChange={setWhatsAppCountryCode}
                          placeholder={t("auth.register.placeholders.dialCode")}
                          options={dialCodeOptions}
                          disabled={submitting}
                          ltr
                        />
                      </label>
                      <label className={tw.authSplitItem}>
                        <span className={tw.authSrOnly}>{t("auth.register.fields.phoneNumber")}</span>
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
                    <span className={tw.authFieldLabel}>{t("auth.register.fields.gender")}</span>
                    <PremiumSelect
                      id="register-gender"
                      value={gender}
                      onChange={setGender}
                      placeholder={t("auth.register.placeholders.gender")}
                      options={genderOptions}
                      disabled={submitting}
                    />
                  </label>

                  {isFreelancer ? (
                    <div className={tw.authField}>
                      <span className={tw.authFieldLabel}>{t("auth.register.fields.categories")}</span>
                      <div className={tw.authCategories}>
                        {CATEGORY_SLUGS.map(({ slug, translationKey }) => (
                          <label key={slug} className={tw.authCategoryItem}>
                            <input
                              type="checkbox"
                              checked={categories.includes(slug)}
                              onChange={() => toggleCategory(slug)}
                              disabled={submitting}
                            />
                            <span>{t(translationKey)}</span>
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
                      {t("auth.register.terms.prefix")}{" "}
                      <Link to="/terms-conditions" className={tw.authInlineLink} target="_blank" rel="noreferrer">
                        {t("auth.register.terms.termsLink")}
                      </Link>{" "}
                      {t("auth.register.terms.and")}{" "}
                      <Link to="/privacy-policy" className={tw.authInlineLink} target="_blank" rel="noreferrer">
                        {t("auth.register.terms.privacyLink")}
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
                      {t("auth.register.buttons.back")}
                    </Button>
                    <Button
                      unstyled
                      type="submit"
                      className={tw.authSubmitBtn}
                      disabled={submitting || Boolean(step2Error)}
                    >
                      {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
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
