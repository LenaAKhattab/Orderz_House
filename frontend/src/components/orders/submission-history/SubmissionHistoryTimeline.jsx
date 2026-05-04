import { useCallback, useState } from "react";
import { downloadOrderFileForRole, viewOrderFileForRole } from "../../../services/api";
import { formatJoDateTime } from "../order-details/orderDetailsUtils";
import "./submission-history.css";

function badgeClass(titleBadgeAr) {
  const t = String(titleBadgeAr || "");
  if (t.includes("النهائي")) return "oh-submission-badge oh-submission-badge--final";
  if (t.includes("الحالي") || t.includes("آخر")) return "oh-submission-badge oh-submission-badge--current";
  return "oh-submission-badge oh-submission-badge--past";
}

/**
 * @param {{ submissionHistory?: { submissions?: unknown[] }; orderId: string; fileAccess: 'client' | 'freelancer' | 'admin' }} props
 */
export default function SubmissionHistoryTimeline({ submissionHistory, orderId, fileAccess = "freelancer" }) {
  const subs = Array.isArray(submissionHistory?.submissions) ? submissionHistory.submissions : [];
  if (!subs.length) return null;

  return (
    <section className="oh-submission-history" dir="rtl">
      <h3 className="oh-submission-history__title">سجل التسليمات والتعديلات</h3>
      {subs.map((s) => (
        <SubmissionTimelineItem key={s.id} submission={s} orderId={orderId} fileAccess={fileAccess} />
      ))}
    </section>
  );
}

function SubmissionTimelineItem({ submission, orderId, fileAccess }) {
  const revisions = Array.isArray(submission.revisionRequests) ? submission.revisionRequests : [];
  const files = Array.isArray(submission.files) ? submission.files : [];

  return (
    <article className="oh-submission-item">
      <div className="oh-submission-item__head">
        <span className={badgeClass(submission.titleBadgeAr)}>{submission.titleBadgeAr || "—"}</span>
        <span className="oh-submission-badge oh-submission-badge--status">{submission.statusBadgeAr || submission.status || "—"}</span>
        <span className="oh-submission-item__meta">
          تسليم رقم {submission.submissionNumber != null ? String(submission.submissionNumber) : "—"} · {formatJoDateTime(submission.submittedAt)}
        </span>
      </div>
      {submission.message ? <p className="oh-submission-item__msg">{submission.message}</p> : null}
      <SubmissionFilesList files={files} orderId={orderId} fileAccess={fileAccess} />
      {revisions.map((r) => (
        <RevisionRequestCard key={r.id} revision={r} orderId={orderId} fileAccess={fileAccess} />
      ))}
    </article>
  );
}

function SubmissionFilesList({ files, orderId, fileAccess }) {
  const [busy, setBusy] = useState(null);

  const onView = useCallback(
    async (f) => {
      setBusy(`v-${f.id}`);
      try {
        await viewOrderFileForRole(orderId, f.id, f.originalName, fileAccess);
      } finally {
        setBusy(null);
      }
    },
    [orderId, fileAccess],
  );

  const onDownload = useCallback(
    async (f) => {
      setBusy(`d-${f.id}`);
      try {
        await downloadOrderFileForRole(orderId, f.id, f.originalName, fileAccess);
      } finally {
        setBusy(null);
      }
    },
    [orderId, fileAccess],
  );

  if (!files.length) return <p className="help" style={{ margin: "6px 0 0" }}>لا توجد ملفات تسليم مسجّلة لهذا الإدخال.</p>;

  return (
    <ul className="oh-submission-files">
      {files.map((f) => (
        <li key={f.id}>
          <span style={{ flex: "1 1 140px", minWidth: 0 }}>{f.originalName || "ملف"}</span>
          <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={busy} onClick={() => void onView(f)}>
              {busy === `v-${f.id}` ? "…" : "عرض"}
            </button>
            <button type="button" className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={busy} onClick={() => void onDownload(f)}>
              {busy === `d-${f.id}` ? "…" : "تحميل"}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RevisionRequestCard({ revision, orderId, fileAccess }) {
  const files = Array.isArray(revision.files) ? revision.files : [];
  const [busy, setBusy] = useState(null);

  const onView = async (f) => {
    setBusy(`v-${f.id}`);
    try {
      await viewOrderFileForRole(orderId, f.id, f.originalName, fileAccess);
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async (f) => {
    setBusy(`d-${f.id}`);
    try {
      await downloadOrderFileForRole(orderId, f.id, f.originalName, fileAccess);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="oh-revision-card">
      <div className="oh-revision-card__title">طلب تعديلات</div>
      <div className="oh-revision-card__role">{revision.requestedByRoleLabelAr || "—"}</div>
      <p className="oh-revision-card__note">{revision.note || "—"}</p>
      <div className="oh-revision-card__time">{formatJoDateTime(revision.createdAt)}</div>
      {files.length ? (
        <ul className="oh-submission-files" style={{ marginTop: 8 }}>
          {files.map((f) => (
            <li key={f.id}>
              <span style={{ flex: "1 1 140px", minWidth: 0 }}>{f.originalName || "مرفق"}</span>
              <span style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}>
                <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={busy} onClick={() => void onView(f)}>
                  {busy === `v-${f.id}` ? "…" : "عرض"}
                </button>
                <button type="button" className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={busy} onClick={() => void onDownload(f)}>
                  {busy === `d-${f.id}` ? "…" : "تحميل"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
