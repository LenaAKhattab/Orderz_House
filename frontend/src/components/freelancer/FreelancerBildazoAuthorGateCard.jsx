import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import {
  BILDAZO_AUTHOR_COUNTRIES,
  BILDAZO_AUTHOR_LINK_FLOWS,
  BILDAZO_WRITER_ROLE_LABEL_AR,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  isBildazoAuthorLinked,
  validateBildazoAuthorLinkForm,
} from "../../constants/bildazoAuthorTerms";
import { submitFreelancerBildazoAuthorLinkRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import "./bildazo-author-gate.css";

function Field({ label, children }) {
  return (
    <label className="bz-gate__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FreelancerBildazoAuthorGateCard({
  link,
  onUpdated,
  isEn = false,
}) {
  const { user } = useAuth();
  const [flow, setFlow] = useState(
    link?.linkFlow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT
      ? BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT
      : BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
  );
  const [fullName, setFullName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [countryIso, setCountryIso] = useState("JO");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [existingEmail, setExistingEmail] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verifiedEmail = link?.orderzVerifiedEmail || user?.email || "";

  useEffect(() => {
    const guessFromUser = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean).join(" ");
    if (!link) {
      if (guessFromUser) setFullName(guessFromUser);
      if (user?.phone) setPhoneE164(String(user.phone));
      return;
    }
    if (link.submitted?.fullName) setFullName(link.submitted.fullName);
    else if (link.suggestedFullName) setFullName(link.suggestedFullName);
    else if (guessFromUser) setFullName(guessFromUser);
    if (link.submitted?.phoneE164) setPhoneE164(link.submitted.phoneE164);
    else if (link.suggestedPhone) setPhoneE164(String(link.suggestedPhone));
    else if (user?.phone) setPhoneE164(String(user.phone));
    if (link.submitted?.countryIso) setCountryIso(link.submitted.countryIso);
    else if (link.suggestedCountryIso) setCountryIso(String(link.suggestedCountryIso));
    if (link.submitted?.existingBildazoEmail) {
      setExistingEmail(link.submitted.existingBildazoEmail);
    } else if (verifiedEmail) {
      setExistingEmail(verifiedEmail);
    }
    if (link.linkFlow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT) {
      setFlow(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT);
    }
  }, [link, user?.firstName, user?.fatherName, user?.familyName, user?.phone, verifiedEmail]);

  const pending = useMemo(() => {
    const s = String(link?.status || "");
    return s.startsWith("pending") || s === "needs_manual_review" || s === "failed";
  }, [link?.status]);

  if (isBildazoAuthorLinked(link)) {
    return (
      <div className="bz-gate bz-gate--success" data-testid="bildazo-linked-profile">
        <div className="bz-gate__brand">
          <img className="bz-gate__logo" src="/brand/bildazo-logo.png" alt="Bildazo" />
        </div>
        <h2 className="bz-gate__success-title">تم ربط حساب الكاتب في Bildazo بنجاح</h2>
        <p className="bz-gate__subtitle">يمكنك الآن التقديم على فرص المقالات باسم الكاتب المرتبط.</p>
        {link?.linked?.bildazoPublicId ? (
          <p className="bz-gate__hint" data-testid="bildazo-public-id">
            المعرّف العام: <strong>{link.linked.bildazoPublicId}</strong>
          </p>
        ) : null}
        {link?.linked?.bildazoProfileUrl ? (
          <p className="bz-gate__hint">
            <a
              href={link.linked.bildazoProfileUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="bildazo-profile-url"
            >
              {link.linked.bildazoProfileUrl}
            </a>
          </p>
        ) : null}
        <Link className="bz-gate__continue" to="/dashboard/freelancer/articles#article-opportunities">
          متابعة إلى فرص المقالات
        </Link>
      </div>
    );
  }

  const pendingCopy =
    link?.status === "pending_new_account"
      ? "جاري إنشاء حساب الكاتب في Bildazo. إذا لم يكتمل الربط يمكنك إعادة الإرسال."
      : link?.status === "needs_manual_review"
        ? "يحتاج طلب الربط إلى مراجعة من الإدارة."
        : link?.status === "failed"
          ? "تعذر إكمال الربط مع Bildazo. تحقق من البيانات ثم أعد المحاولة."
          : pending
            ? "تم حفظ طلب الربط. أعد المحاولة إذا لم يظهر الحساب مرتبطًا."
            : null;

  const pendingTestId =
    link?.status === "needs_manual_review"
      ? "bildazo-review-state"
      : link?.status === "failed"
        ? "bildazo-failed-state"
        : "bildazo-pending-state";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const payload =
      flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT
        ? { fullName, phoneE164, countryIso, dateOfBirth, password, passwordConfirm }
        : { existingBildazoEmail: existingEmail, password: existingPassword };
    const validation = validateBildazoAuthorLinkForm({ flow, payload, termsChecked });
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      const body = {
        linkFlow: flow,
        acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
        acceptedTermsAcknowledged: true,
      };
      if (flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT) {
        body.fullName = fullName.trim();
        body.phoneE164 = phoneE164.trim() || undefined;
        body.countryIso = countryIso.trim() || undefined;
        body.dateOfBirth = dateOfBirth.trim() || undefined;
        body.password = password;
        body.passwordConfirm = passwordConfirm;
      } else {
        body.existingBildazoEmail = existingEmail.trim();
        body.password = existingPassword;
        body.fullName = fullName.trim() || undefined;
      }
      const res = await submitFreelancerBildazoAuthorLinkRequest(body);
      setPassword("");
      setPasswordConfirm("");
      setExistingPassword("");
      onUpdated?.(res?.data || null);
    } catch (err) {
      const raw = getSafeApiErrorMessage(err);
      const genericAuth = /invalid email or password|تعذر التحقق/i.test(String(raw || ""));
      setError(
        genericAuth
          ? "تعذر التحقق من حساب Bildazo. تأكد من البريد وكلمة المرور."
          : raw || (isEn ? "Could not complete the Bildazo link." : "تعذر إكمال ربط Bildazo."),
      );
    } finally {
      setBusy(false);
    }
  };

  const informational = link?.gateEnabled === false;

  return (
    <div className="bz-gate" dir="rtl">
      <div className="bz-gate__brand">
        <img className="bz-gate__logo" src="/brand/bildazo-logo.png" alt="Bildazo" data-testid="bildazo-logo" />
      </div>
      <h2 className="bz-gate__title">حساب الكاتب في Bildazo</h2>
      <p className="bz-gate__subtitle">
        {informational
          ? "اربط حساب الكاتب الآن لتنشر مقالاتك لاحقًا على Bildazo بسهولة وباسمك."
          : "اربط حساب الكاتب في Bildazo لتقديم مقالات Mini Article باسمك مباشرة بعد القبول."}
      </p>

      {pendingCopy ? (
        <p className="bz-gate__status" data-testid={pendingTestId}>
          {pendingCopy}
        </p>
      ) : null}

      <div className="bz-gate__tabs" role="tablist">
        <button
          type="button"
          className={`bz-gate__tab${flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? " is-active" : ""}`}
          onClick={() => setFlow(BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT)}
        >
          أنشئ حساب الكاتب في Bildazo
        </button>
        <button
          type="button"
          className={`bz-gate__tab${flow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT ? " is-active" : ""}`}
          onClick={() => setFlow(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT)}
        >
          لدي حساب في Bildazo
        </button>
      </div>

      <form className="bz-gate__form" onSubmit={handleSubmit}>
        {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? (
          <>
            <div className="bz-gate__grid bz-gate__grid--2">
              <Field label="الاسم الكامل">
                <input
                  className="bz-gate__input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="name"
                  data-testid="bildazo-full-name"
                />
              </Field>
              <Field label="البريد الإلكتروني">
                <input
                  className="bz-gate__input"
                  value={verifiedEmail}
                  readOnly
                  aria-readonly="true"
                  data-testid="bildazo-orderz-email"
                />
              </Field>
              <Field label="رقم الجوال">
                <input
                  className="bz-gate__input"
                  value={phoneE164}
                  onChange={(e) => setPhoneE164(e.target.value)}
                  placeholder="+9627XXXXXXXX"
                  autoComplete="tel"
                />
              </Field>
              <Field label="الدولة">
                <select
                  className="bz-gate__select"
                  value={countryIso}
                  onChange={(e) => setCountryIso(e.target.value)}
                  data-testid="bildazo-country"
                >
                  {BILDAZO_AUTHOR_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.labelAr}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="تاريخ الميلاد (اختياري)">
                <input
                  className="bz-gate__input"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </Field>
              <Field label="فئة الحساب">
                <input className="bz-gate__input" value={BILDAZO_WRITER_ROLE_LABEL_AR} readOnly />
              </Field>
              <Field label="كلمة المرور">
                <input
                  className="bz-gate__input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  data-testid="bildazo-new-password"
                />
              </Field>
              <Field label="تأكيد كلمة المرور">
                <input
                  className="bz-gate__input"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  data-testid="bildazo-new-password-confirm"
                />
              </Field>
            </div>
            <p className="bz-gate__hint">
              فئة الحساب ثابتة على «كاتب». يُنشأ الحساب عبر خادم OrderzHouse ولا تُحفظ كلمة المرور هنا.
            </p>
          </>
        ) : (
          <div className="bz-gate__grid bz-gate__grid--2">
            <Field label="بريد حساب Bildazo">
              <input
                className="bz-gate__input"
                type="email"
                value={existingEmail}
                onChange={(e) => setExistingEmail(e.target.value)}
                autoComplete="username"
                required
                data-testid="bildazo-existing-email"
              />
            </Field>
            <Field label="كلمة مرور Bildazo">
              <input
                className="bz-gate__input"
                type="password"
                value={existingPassword}
                onChange={(e) => setExistingPassword(e.target.value)}
                autoComplete="current-password"
                required
                data-testid="bildazo-existing-password"
              />
            </Field>
          </div>
        )}

        <label className="bz-gate__terms">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
          />
          <span>{ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR}</span>
        </label>

        {error ? (
          <p className="bz-gate__error" data-testid="bildazo-auth-error">
            {error}
          </p>
        ) : null}

        <button className="bz-gate__submit" type="submit" disabled={busy}>
          {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT
            ? "إنشاء وربط حساب الكاتب"
            : "ربط حساب Bildazo الحالي"}
        </button>
      </form>
    </div>
  );
}
