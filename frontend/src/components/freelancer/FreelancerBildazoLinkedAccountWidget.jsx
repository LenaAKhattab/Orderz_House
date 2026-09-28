import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  BILDAZO_AUTHOR_LINK_FLOWS,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  bildazoLinkFailureMessage,
  isBildazoAuthorLinked,
  validateBildazoAuthorLinkForm,
} from "../../constants/bildazoAuthorTerms";
import {
  changeFreelancerBildazoAuthorLinkRequest,
  getFreelancerBildazoAuthorLinkRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/articlesResources";
import { formatLocaleDate } from "../../i18n/formatLocale";
import FreelancerBildazoAuthorLinkForm from "./FreelancerBildazoAuthorLinkForm";
import "./bildazo-author-gate.css";

function formatLinkedAt(value, locale) {
  if (!value) return null;
  const formatted = formatLocaleDate(value, locale);
  return formatted || null;
}

export default function FreelancerBildazoLinkedAccountWidget({
  link,
  onUpdated,
  isEn = false,
}) {
  const { user } = useAuth();
  const { t, dir, locale } = useTranslation();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [flow, setFlow] = useState(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT);
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
  const publicId = link?.linked?.bildazoPublicId || "";
  const linkedEmail = link?.linked?.email || link?.submitted?.existingBildazoEmail || verifiedEmail;
  const linkedAt = formatLinkedAt(link?.linked?.linkedAt, locale);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    const guessFromUser = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean).join(" ");
    setFullName(link?.submitted?.fullName || link?.suggestedFullName || guessFromUser || "");
    setPhoneE164(link?.submitted?.phoneE164 || link?.suggestedPhone || user?.phone || "");
    setCountryIso(link?.submitted?.countryIso || link?.suggestedCountryIso || "JO");
    setExistingEmail(verifiedEmail);
  }, [link, user, verifiedEmail]);

  if (!isBildazoAuthorLinked(link)) return null;

  const resetSecrets = () => {
    setPassword("");
    setPasswordConfirm("");
    setExistingPassword("");
  };

  const closeChange = () => {
    setChangeOpen(false);
    setConfirmChange(false);
    setTermsChecked(false);
    setError("");
    resetSecrets();
  };

  const handleReverify = async () => {
    setOpen(false);
    const me = await getFreelancerBildazoAuthorLinkRequest().catch(() => null);
    if (me?.data) onUpdated?.(me.data);
  };

  const handleChangeSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!confirmChange) {
      setError(t("articles.bildazoGate.confirmFutureOnly"));
      return;
    }
    const payload =
      flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT
        ? { fullName, phoneE164, countryIso, dateOfBirth, password, passwordConfirm }
        : { existingBildazoEmail: existingEmail, password: existingPassword };
    const validation = validateBildazoAuthorLinkForm({ flow, payload, termsChecked, t });
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
        confirmChange: true,
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
      const res = await changeFreelancerBildazoAuthorLinkRequest(body);
      const next = res?.data || null;
      resetSecrets();
      if (next?.changed === false && next?.failureCode) {
        setError(
          bildazoLinkFailureMessage({ status: "failed", failureCode: next.failureCode }, isEn, t) ||
            t("articles.bildazoGate.changeFailed"),
        );
        onUpdated?.(next);
        return;
      }
      onUpdated?.(next);
      closeChange();
    } catch (err) {
      resetSecrets();
      const raw = getSafeApiErrorMessage(err);
      const unsupported = /replace-link|replace mode/i.test(String(raw || ""));
      setError(
        unsupported
          ? t("articles.bildazoGate.replaceUnsupported")
          : raw || t("articles.bildazoGate.changeFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bz-account" dir={dir} ref={rootRef}>
      <button
        type="button"
        className="bz-account__chip"
        data-testid="bildazo-linked-profile"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bz-account__avatar">
          <img src="/brand/bildazo-logo.png" alt="" />
        </span>
        <span className="bz-account__copy">
          <span className="bz-account__title">
            <span className="bz-account__dot" aria-hidden="true" />
            {t("articles.bildazoGate.linkedTitle")}
          </span>
          {publicId ? (
            <span className="bz-account__id" data-testid="bildazo-public-id">
              {t("articles.bildazoGate.publicId", { id: publicId })}
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="bz-account__menu" data-testid="bildazo-account-menu" role="menu">
          <p className="bz-account__helper">{t("articles.bildazoGate.publishHelper")}</p>
          {publicId ? <p className="bz-account__detail">{t("articles.bildazoGate.publicId", { id: publicId })}</p> : null}
          {linkedEmail ? <p className="bz-account__detail">{t("articles.bildazoGate.emailLine", { email: linkedEmail })}</p> : null}
          {linkedAt && linkedAt !== "—" ? <p className="bz-account__detail">{t("articles.bildazoGate.linkedAt", { date: linkedAt })}</p> : null}
          {link?.linked?.bildazoProfileUrl ? (
            <a
              className="bz-account__detail"
              href={link.linked.bildazoProfileUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="bildazo-profile-url"
            >
              {link.linked.bildazoProfileUrl}
            </a>
          ) : null}
          <button
            type="button"
            className="bz-account__action"
            data-testid="bildazo-change-account"
            onClick={() => {
              setOpen(false);
              setChangeOpen(true);
            }}
          >
            {t("articles.bildazoGate.changeAccount")}
          </button>
          <button type="button" className="bz-account__action bz-account__action--ghost" onClick={handleReverify}>
            {t("articles.bildazoGate.recheck")}
          </button>
          <button type="button" className="bz-account__action bz-account__action--ghost" onClick={() => setOpen(false)}>
            {t("articles.bildazoGate.close")}
          </button>
        </div>
      ) : null}

      {changeOpen ? (
        <div className="bz-change" data-testid="bildazo-change-modal">
          <div className="bz-change__dialog" role="dialog" aria-modal="true" aria-labelledby="bz-change-title">
            <h3 id="bz-change-title" className="bz-change__title">
              {t("articles.bildazoGate.changeTitle")}
            </h3>
            <p className="bz-change__note">{t("articles.bildazoGate.changeNote")}</p>
            <label className="bz-gate__terms">
              <input
                type="checkbox"
                checked={confirmChange}
                onChange={(e) => setConfirmChange(e.target.checked)}
                data-testid="bildazo-change-confirm"
              />
              <span>{t("articles.bildazoGate.changeConfirm")}</span>
            </label>
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
              busy={busy || !confirmChange}
              onSubmit={handleChangeSubmit}
              newSubmitLabel={t("articles.bildazoGate.submitNewChange")}
              existingSubmitLabel={t("articles.bildazoGate.submitExistingChange")}
            />
            <button type="button" className="bz-account__action bz-account__action--ghost" onClick={closeChange}>
              {t("articles.bildazoGate.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
