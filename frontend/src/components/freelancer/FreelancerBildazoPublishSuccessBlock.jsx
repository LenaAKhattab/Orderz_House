import {
  BILDAZO_VIEW_ARTICLE_AR,
  BILDAZO_VIEW_WRITER_PROFILE_AR,
  freelancerBildazoPublishCopy,
} from "../../constants/bildazoArticlePublish";

export default function FreelancerBildazoPublishSuccessBlock({
  publish,
  writerProfileUrl = null,
  isEn = false,
  testId = "freelancer-bildazo-publish-status",
}) {
  const copy = freelancerBildazoPublishCopy(publish, isEn);
  if (!copy || copy.tone !== "success") return null;

  const articleUrl = copy.url || publish?.articleUrl || null;
  const profileUrl = writerProfileUrl || null;

  return (
    <div className="grid gap-2" data-testid={testId}>
      <p className="mb-0 mt-0 font-semibold text-[color:var(--dash-text,#172033)]">{copy.text}</p>
      <div className="flex flex-wrap gap-2">
        {articleUrl ? (
          <a
            className="oh-account-btn-primary inline-flex no-underline"
            href={articleUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="bildazo-view-article"
          >
            {isEn ? "View article" : BILDAZO_VIEW_ARTICLE_AR}
          </a>
        ) : null}
        {profileUrl ? (
          <a
            className="oh-account-btn-ghost inline-flex no-underline"
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="bildazo-view-writer-profile"
          >
            {isEn ? "View writer profile" : BILDAZO_VIEW_WRITER_PROFILE_AR}
          </a>
        ) : null}
      </div>
    </div>
  );
}
