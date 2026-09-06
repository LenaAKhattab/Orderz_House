import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  BILDAZO_AUTHOR_LINK_FLOWS,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  bildazoLinkFailureMessage,
  isBildazoAuthorLinked,
  validateBildazoAuthorLinkForm,
} from "../../constants/bildazoAuthorTerms";
import { submitFreelancerBildazoAuthorLinkRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import FreelancerBildazoAuthorLinkForm from "./FreelancerBildazoAuthorLinkForm";
import "./bildazo-author-gate.css";

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

  if (isBildazoAuthorLinked(link)) return null;

  const pendingCopy =
    link?.status === "pending_new_account"
      ? "جاري إنشاء حساب الكاتب في Bildazo. إذا لم يكتمل الربط يمكنك إعادة الإرسال."
      : link?.status === "needs_manual_review"
        ? "يحتاج طلب الربط إلى مراجعة من الإدارة."
        : link?.status === "failed"
          ? bildazoLinkFailureMessage(link, isEn)
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
      const next = res?.data || null;
      setPassword("");
      setPasswordConfirm("");
      setExistingPassword("");
      if (!isBildazoAuthorLinked(next)) {
        const failedMsg = bildazoLinkFailureMessage(next, isEn);
        if (failedMsg) setError(failedMsg);
      }
      onUpdated?.(next);
    } catch (err) {
      setPassword("");
      setPasswordConfirm("");
      setExistingPassword("");
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

      <FreelancerBildazoAuthorLinkForm
        flow={flow}
        onFlowChange={setFlow}
        verifiedEmail={verifiedEmail}
        fullName={fullName}
        onFullNameChange={setFullName}
        phoneE164={phoneE164}
        onPhoneChange={setPhoneE164}
        countryIso={countryIso}
        onCountryChange={setCountryIso}
        dateOfBirth={dateOfBirth}
        onDateOfBirthChange={setDateOfBirth}
        password={password}
        onPasswordChange={setPassword}
        passwordConfirm={passwordConfirm}
        onPasswordConfirmChange={setPasswordConfirm}
        existingEmail={existingEmail}
        onExistingEmailChange={setExistingEmail}
        existingPassword={existingPassword}
        onExistingPasswordChange={setExistingPassword}
        termsChecked={termsChecked}
        onTermsChange={setTermsChecked}
        error={error}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
