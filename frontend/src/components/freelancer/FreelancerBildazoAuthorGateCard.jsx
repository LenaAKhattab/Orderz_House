import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";
import {
  BILDAZO_AUTHOR_LINK_FLOWS,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  emailsMatch,
  isBildazoAuthorLinked,
  validateBildazoAuthorLinkForm,
} from "../../constants/bildazoAuthorTerms";
import { submitFreelancerBildazoAuthorLinkRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.85rem] font-bold text-[color:var(--dash-text,#172033)]">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] bg-white p-2.5 font-inherit text-[0.95rem]";

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
  const [countryIso, setCountryIso] = useState("");
  const [bio, setBio] = useState("");
  const [existingEmail, setExistingEmail] = useState("");
  const [existingPublicId, setExistingPublicId] = useState("");
  const [existingProfileUrl, setExistingProfileUrl] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verifiedEmail = link?.orderzVerifiedEmail || user?.email || "";

  useEffect(() => {
    const guessFromUser = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean).join(" ");
    if (!link) {
      if (guessFromUser) setFullName(guessFromUser);
      return;
    }
    if (link.submitted?.fullName) setFullName(link.submitted.fullName);
    else if (link.suggestedFullName) setFullName(link.suggestedFullName);
    else if (guessFromUser) setFullName(guessFromUser);
    if (link.submitted?.phoneE164) setPhoneE164(link.submitted.phoneE164);
    else if (link.suggestedPhone) setPhoneE164(String(link.suggestedPhone));
    if (link.submitted?.countryIso) setCountryIso(link.submitted.countryIso);
    else if (link.suggestedCountryIso) setCountryIso(String(link.suggestedCountryIso));
    if (link.submitted?.bio) setBio(link.submitted.bio);
    if (link.submitted?.existingBildazoEmail) setExistingEmail(link.submitted.existingBildazoEmail);
    if (link.submitted?.existingBildazoPublicId) setExistingPublicId(link.submitted.existingBildazoPublicId);
    if (link.submitted?.existingBildazoProfileUrl) {
      setExistingProfileUrl(link.submitted.existingBildazoProfileUrl);
    }
    if (link.linkFlow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT) {
      setFlow(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT);
    }
  }, [link, user?.firstName, user?.fatherName, user?.familyName]);

  const pending = useMemo(() => {
    const s = String(link?.status || "");
    return s.startsWith("pending") || s === "needs_manual_review" || s === "failed";
  }, [link?.status]);

  if (isBildazoAuthorLinked(link)) {
    return (
      <div
        className="dash-ui-surface--soft mb-4 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] p-4"
        data-testid="bildazo-linked-profile"
      >
        <h2 className="mb-1 mt-0 text-[1.05rem] font-extrabold">حساب الكاتب مرتبط</h2>
        <p className="m-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
          يمكنك التقديم على فرص المقالات باسم الكاتب المرتبط في Bildazo.
        </p>
        {link?.linked?.bildazoPublicId ? (
          <p className="mb-0 mt-2 text-[0.9rem]" data-testid="bildazo-public-id">
            Public ID: <strong>{link.linked.bildazoPublicId}</strong>
          </p>
        ) : null}
        {link?.linked?.bildazoProfileUrl ? (
          <p className="mb-0 mt-1 text-[0.9rem]">
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
      </div>
    );
  }

  const pendingCopy =
    link?.status === "pending_new_account"
      ? "تم حفظ طلب إنشاء حساب الكاتب في Bildazo. سيتم تفعيل التقديم على المقالات بعد إكمال الربط."
      : link?.status === "needs_manual_review"
        ? "يحتاج طلب الربط إلى مراجعة من الإدارة."
        : link?.status === "failed"
          ? "تعذر إكمال الربط مع Bildazo. يمكنك إعادة إرسال الطلب لاحقًا."
          : link?.status === "pending_external_verification"
            ? "تم حفظ طلب ربط حساب Bildazo. سيتم التحقق من ملكية الحساب قبل تفعيل التقديم على المقالات."
            : pending
              ? "تم حفظ طلب ربط حساب Bildazo. سيتم التحقق من ملكية الحساب قبل تفعيل التقديم على المقالات."
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
    const payload = {
      fullName,
      phoneE164,
      countryIso,
      bio,
      existingBildazoEmail: existingEmail,
      existingBildazoPublicId: existingPublicId,
      existingBildazoProfileUrl: existingProfileUrl,
    };
    const validation = validateBildazoAuthorLinkForm({ flow, payload, termsChecked });
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      const body = {
        linkFlow: flow,
        fullName: fullName.trim() || undefined,
        phoneE164: phoneE164.trim() || undefined,
        countryIso: countryIso.trim() || undefined,
        bio: bio.trim() || undefined,
        acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
        acceptedTermsAcknowledged: true,
      };
      if (flow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT) {
        body.existingBildazoEmail = existingEmail.trim() || undefined;
        body.existingBildazoPublicId = existingPublicId.trim() || undefined;
        body.existingBildazoProfileUrl = existingProfileUrl.trim() || undefined;
      }
      const res = await submitFreelancerBildazoAuthorLinkRequest(body);
      onUpdated?.(res?.data || null);
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Could not save the Bildazo link request." : "تعذر حفظ طلب الربط."),
      );
    } finally {
      setBusy(false);
    }
  };

  const informational = link?.gateEnabled === false;

  return (
    <div className="dash-ui-surface--soft mb-4 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] p-4">
      <h2 className="mb-1 mt-0 text-[1.05rem] font-extrabold">حساب الكاتب في Bildazo</h2>
      {informational ? (
        <p className="mt-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
          يمكنك إرسال طلب الربط الآن. التقديم على المقالات ما زال متاحًا حتى يتم تفعيل بوابة Bildazo.
        </p>
      ) : (
        <p className="mt-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
          قبل التقديم على المقالات يجب إنشاء أو ربط حساب الكاتب في Bildazo. هذه الصفحة تحفظ الطلب فقط، ولا تُنشئ حسابًا في Bildazo ولا تُفعّل الربط مباشرة.
        </p>
      )}

      {pendingCopy ? (
        <p
          className="rounded-lg bg-[color:var(--dash-info-bg,#eef1f6)] px-2.5 py-2 text-[0.9rem] font-semibold text-[color:var(--dash-primary,#2f3b65)]"
          data-testid={pendingTestId}
        >
          {pendingCopy}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        <Button
          type="button"
          variant={flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? "primary" : "secondary"}
          onClick={() => setFlow(BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT)}
        >
          أنشئ حساب الكاتب في Bildazo
        </Button>
        <Button
          type="button"
          variant={flow === BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT ? "primary" : "secondary"}
          onClick={() => setFlow(BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT)}
        >
          لدي حساب في Bildazo
        </Button>
      </div>

      <form className="grid max-w-[640px] gap-3" onSubmit={handleSubmit}>
        {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT ? (
          <>
            <p className="m-0 text-[0.92rem] text-[color:var(--dash-text-secondary,#4b5563)]">
              سنستخدم بريدك الموثق في OrderzHouse لإنشاء أو ربط حساب الكاتب في Bildazo لاحقًا. لن تحتاج
              إلى إدخال كلمة مرور هنا، وسيتم تعيين كلمة المرور من خلال Bildazo عند تفعيل الربط.
            </p>
            <Field label="البريد الموثق في OrderzHouse">
              <input
                className={inputClass}
                value={verifiedEmail}
                readOnly
                aria-readonly="true"
                data-testid="bildazo-orderz-email"
              />
            </Field>
            <Field label="الاسم الكامل">
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={200}
              />
            </Field>
          </>
        ) : (
          <>
            <p className="m-0 text-[0.92rem] text-[color:var(--dash-text-secondary,#4b5563)]">
              إذا كان لديك حساب سابق في Bildazo، أدخل بريد الحساب أو الرقم العام أو رابط الملف الشخصي.
              إذا كان البريد مختلفًا عن بريدك في OrderzHouse، سنحتاج إلى التحقق من ملكيتك للحساب قبل الربط.
            </p>
            <Field label="بريد حساب Bildazo (اختياري)">
              <input
                className={inputClass}
                type="email"
                value={existingEmail}
                onChange={(e) => setExistingEmail(e.target.value)}
                autoComplete="off"
              />
            </Field>
            {existingEmail && emailsMatch(existingEmail, verifiedEmail) ? (
              <p className="m-0 text-[0.88rem] font-semibold text-[color:var(--dash-primary,#2f3b65)]">
                هذا البريد يطابق بريدك الموثق في OrderzHouse، وسيكون ربطه أسهل عند تفعيل الربط.
              </p>
            ) : null}
            {existingEmail && verifiedEmail && !emailsMatch(existingEmail, verifiedEmail) ? (
              <p className="m-0 text-[0.88rem] font-semibold text-[color:var(--dash-danger,#c03535)]">
                هذا البريد مختلف عن بريدك في OrderzHouse، لذلك سيحتاج إلى تحقق إضافي قبل الربط.
              </p>
            ) : null}
            <Field label="الرقم العام في Bildazo (اختياري)">
              <input
                className={inputClass}
                value={existingPublicId}
                onChange={(e) => setExistingPublicId(e.target.value)}
              />
            </Field>
            <Field label="رابط الملف الشخصي (اختياري)">
              <input
                className={inputClass}
                value={existingProfileUrl}
                onChange={(e) => setExistingProfileUrl(e.target.value)}
              />
            </Field>
            <Field label="الاسم الكامل (اختياري)">
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={200}
              />
            </Field>
          </>
        )}

        <Field label="الهاتف بصيغة دولية (اختياري)">
          <input
            className={inputClass}
            value={phoneE164}
            onChange={(e) => setPhoneE164(e.target.value)}
            placeholder="+9627XXXXXXXX"
          />
        </Field>
        <Field label="رمز الدولة ISO (اختياري)">
          <input
            className={inputClass}
            value={countryIso}
            onChange={(e) => setCountryIso(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="JO"
          />
        </Field>
        <Field label="نبذة قصيرة (اختياري)">
          <textarea
            className={inputClass}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
          />
        </Field>

        <label className="flex items-start gap-2 text-[0.9rem]">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => setTermsChecked(e.target.checked)}
            className="mt-1"
          />
          <span>{ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR}</span>
        </label>
        <p className="m-0 text-[0.75rem] text-[color:var(--dash-text-muted,#667085)]">
          نسخة الشروط: {ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION} — نص مؤقت للمراجعة القانونية لاحقًا.
        </p>

        {error ? <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">{error}</p> : null}

        <Button type="submit" disabled={busy}>
          {flow === BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT
            ? "إرسال طلب إنشاء حساب Bildazo"
            : "إرسال طلب ربط حساب Bildazo"}
        </Button>
      </form>
      <p className="mb-0 mt-3 hidden" data-password-field="absent">
        لا تُطلب كلمة مرور Bildazo داخل OrderzHouse.
      </p>
    </div>
  );
}
