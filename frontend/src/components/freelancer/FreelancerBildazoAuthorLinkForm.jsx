import {
  BILDAZO_AUTHOR_COUNTRIES,
  BILDAZO_AUTHOR_LINK_FLOWS,
} from "../../constants/bildazoAuthorTerms";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/articlesResources";

function Field({ label, children }) {
  return (
    <label className="bz-gate__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FreelancerBildazoAuthorLinkForm({
  flow,
  onFlowChange,
  verifiedEmail,
  fullName,
  onFullNameChange,
  phoneE164,
  onPhoneChange,
  countryIso,
  onCountryChange,
  dateOfBirth,
  onDateOfBirthChange,
  password,
  onPasswordChange,
  passwordConfirm,
  onPasswordConfirmChange,
  existingEmail,
  onExistingEmailChange,
  existingPassword,
  onExistingPasswordChange,
  termsChecked,
  onTermsChange,
  extra,
  error,
  busy,
  onSubmit,
  newSubmitLabel,
  existingSubmitLabel,
}) {
  const { t, locale } = useTranslation();
  const submitNew = newSubmitLabel || t("articles.bildazoGate.submitNew");
  const submitExisting = existingSubmitLabel || t("articles.bildazoGate.submitExisting");
  const regionNames = new Intl.DisplayNames([locale === "en" ? "en" : "ar"], { type: "region" });
  return (
    <>
      <div className="bz-gate__tabs" role="tablist">
        <button
          type="button"
          className={`bz-gate__tab${flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? " is-active" : ""}`}
          onClick={() => onFlowChange(BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT)}
        >
          {t("articles.bildazoGate.tabNew")}
        </button>
        <button
          type="button"
          className={`bz-gate__tab${flow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT ? " is-active" : ""}`}
          onClick={() => onFlowChange(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT)}
        >
          {t("articles.bildazoGate.tabExisting")}
        </button>
      </div>

      <form className="bz-gate__form" onSubmit={onSubmit}>
        {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? (
          <>
            <div className="bz-gate__grid bz-gate__grid--2">
              <Field label={t("articles.bildazoGate.fullName")}>
                <input
                  className="bz-gate__input"
                  value={fullName}
                  onChange={(e) => onFullNameChange(e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="name"
                  data-testid="bildazo-full-name"
                />
              </Field>
              <Field label={t("articles.bildazoGate.email")}>
                <input
                  className="bz-gate__input"
                  value={verifiedEmail}
                  readOnly
                  aria-readonly="true"
                  data-testid="bildazo-orderz-email"
                />
              </Field>
              <Field label={t("articles.bildazoGate.phone")}>
                <input
                  className="bz-gate__input"
                  value={phoneE164}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  placeholder="+9627XXXXXXXX"
                  autoComplete="tel"
                />
              </Field>
              <Field label={t("articles.bildazoGate.country")}>
                <select
                  className="bz-gate__select"
                  value={countryIso}
                  onChange={(e) => onCountryChange(e.target.value)}
                  data-testid="bildazo-country"
                >
                  {BILDAZO_AUTHOR_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {regionNames.of(c.iso) || c.labelAr}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("articles.bildazoGate.birthOptional")}>
                <input
                  className="bz-gate__input"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => onDateOfBirthChange(e.target.value)}
                />
              </Field>
              <Field label={t("articles.bildazoGate.accountCategory")}>
                <input className="bz-gate__input" value={t("articles.bildazoGate.writerRole")} readOnly />
              </Field>
              <Field label={t("articles.bildazoGate.password")}>
                <input
                  className="bz-gate__input"
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  autoComplete="new-password"
                  required
                  data-testid="bildazo-new-password"
                />
              </Field>
              <Field label={t("articles.bildazoGate.passwordConfirm")}>
                <input
                  className="bz-gate__input"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => onPasswordConfirmChange(e.target.value)}
                  autoComplete="new-password"
                  required
                  data-testid="bildazo-new-password-confirm"
                />
              </Field>
            </div>
            <p className="bz-gate__hint">
              {t("articles.bildazoGate.roleHint")}
            </p>
          </>
        ) : (
          <div className="bz-gate__grid bz-gate__grid--2">
            <Field label={t("articles.bildazoGate.existingEmail")}>
              <input
                className="bz-gate__input"
                type="email"
                value={existingEmail}
                onChange={(e) => onExistingEmailChange(e.target.value)}
                autoComplete="username"
                required
                data-testid="bildazo-existing-email"
              />
            </Field>
            <Field label={t("articles.bildazoGate.existingPassword")}>
              <input
                className="bz-gate__input"
                type="password"
                value={existingPassword}
                onChange={(e) => onExistingPasswordChange(e.target.value)}
                autoComplete="current-password"
                required
                data-testid="bildazo-existing-password"
              />
            </Field>
          </div>
        )}

        {extra}

        <label className="bz-gate__terms">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => onTermsChange(e.target.checked)}
          />
          <span>{t("articles.bildazoGate.terms")}</span>
        </label>

        {error ? (
          <p className="bz-gate__error" data-testid="bildazo-auth-error">
            {error}
          </p>
        ) : null}

        <button className="bz-gate__submit" type="submit" disabled={busy}>
          {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? submitNew : submitExisting}
        </button>
      </form>
    </>
  );
}
