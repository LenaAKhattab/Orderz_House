import FileList from "../order-details/FileList";
import { formatJoDateTime } from "../order-details/orderDetailsUtils";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/ordersAdminResources";
import "./submission-history.css";

const SH = "ordersAdmin.orderDetails.submissionHistory";
const STATUS_KEYS = new Set(["submitted", "revision_requested", "accepted", "superseded"]);
const ROLE_KEYS = new Set(["client", "admin", "super_admin"]);

/** Label + tone from structured fields (the API's *Ar strings are Arabic-only). */
function submissionTitle(s, t) {
  const accepted = String(s?.status || "") === "accepted";
  if (s?.isFinal || (s?.isCurrent && accepted)) return { label: t(`${SH}.badge.final`), cls: "oh-submission-badge--final" };
  if (s?.isCurrent) return { label: t(`${SH}.badge.current`), cls: "oh-submission-badge--current" };
  return { label: t(`${SH}.badge.past`), cls: "oh-submission-badge--past" };
}

function submissionStatus(s, t, locale) {
  const st = String(s?.status || "");
  if (STATUS_KEYS.has(st)) return t(`${SH}.status.${st}`);
  if (locale === "ar" && s?.statusBadgeAr) return s.statusBadgeAr;
  return st || t(`${SH}.unknownStatus`);
}

function requesterLabel(r, t, locale) {
  const role = String(r?.requestedByRole || "");
  if (ROLE_KEYS.has(role)) return t(`${SH}.requestedBy.${role}`);
  if (locale === "ar" && r?.requestedByRoleLabelAr) return r.requestedByRoleLabelAr;
  return role || t(`${SH}.unknownRole`);
}

/**
 * @param {{ submissionHistory?: { submissions?: unknown[] }; orderId: string; fileAccess: 'client' | 'freelancer' | 'admin'; hideTitle?: boolean }} props
 */
export default function SubmissionHistoryTimeline({ submissionHistory, orderId, fileAccess = "freelancer", hideTitle = false }) {
  const { t, dir, locale } = useTranslation();
  const subs = Array.isArray(submissionHistory?.submissions) ? submissionHistory.submissions : [];
  if (!subs.length) return null;

  return (
    <section className="oh-submission-history" dir={dir}>
      {hideTitle ? null : <h3 className="oh-submission-history__title">{t(`${SH}.title`)}</h3>}
      {subs.map((s) => (
        <SubmissionTimelineItem key={s.id} submission={s} orderId={orderId} fileAccess={fileAccess} locale={locale} />
      ))}
    </section>
  );
}

function SubmissionTimelineItem({ submission, orderId, fileAccess, locale }) {
  const { t } = useTranslation();
  const revisions = Array.isArray(submission.revisionRequests) ? submission.revisionRequests : [];
  const files = Array.isArray(submission.files) ? submission.files : [];
  const submissionNumber = submission.submissionNumber != null ? String(submission.submissionNumber) : "—";
  const title = submissionTitle(submission, t);

  return (
    <article className="oh-submission-item">
      <div className="oh-submission-item__head">
        <span className={`oh-submission-badge ${title.cls}`}>{title.label}</span>
        <span className="oh-submission-badge oh-submission-badge--status">{submissionStatus(submission, t, locale)}</span>
        <span className="oh-submission-item__meta">
          {t(`${SH}.submissionMeta`, {
            number: submissionNumber,
            date: formatJoDateTime(submission.submittedAt),
          })}
        </span>
      </div>
      {submission.message ? (
        <p className="oh-submission-item__msg" dir="auto">
          {submission.message}
        </p>
      ) : null}
      <FileList files={files} orderId={orderId} fileAccess={fileAccess} emptyText={t(`${SH}.noSubmissionFiles`)} />
      {revisions.map((r) => (
        <RevisionRequestCard key={r.id} revision={r} orderId={orderId} fileAccess={fileAccess} locale={locale} />
      ))}
    </article>
  );
}

function RevisionRequestCard({ revision, orderId, fileAccess, locale }) {
  const { t } = useTranslation();
  const files = Array.isArray(revision.files) ? revision.files : [];

  return (
    <div className="oh-revision-card">
      <div className="oh-revision-card__head">
        <span className="oh-revision-card__title">{t(`${SH}.revisionTitle`)}</span>
        <span className="oh-revision-card__role">{t(`${SH}.requestedByPrefix`, { who: requesterLabel(revision, t, locale) })}</span>
        <time className="oh-revision-card__time" dateTime={revision.createdAt || undefined}>
          {formatJoDateTime(revision.createdAt)}
        </time>
      </div>
      <p className="oh-revision-card__note" dir="auto">
        {revision.note || "—"}
      </p>
      {files.length ? <FileList files={files} orderId={orderId} fileAccess={fileAccess} emptyText="" /> : null}
    </div>
  );
}
