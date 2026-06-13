import PublicPageHeader from "../layout/PublicPageHeader";

const BLOCK_RENDERERS = {
  title: ({ block }) => (
    <section className="hiw-block hiw-block--title">
      {block.title ? <h2 className="hiw-block__heading">{block.title}</h2> : null}
      {block.body ? <p className="hiw-block__lede">{block.body}</p> : null}
    </section>
  ),
  text: ({ block, index }) => (
    <article className="hiw-block hiw-block--text">
      <div className="hiw-block__step-inner">
        <span className="hiw-block__step-num" aria-hidden="true">
          {index + 1}
        </span>
        <div className="hiw-block__step-copy">
          {block.title ? <h3 className="hiw-block__step-title">{block.title}</h3> : null}
          {block.body ? <p className="hiw-block__step-text">{block.body}</p> : null}
        </div>
      </div>
    </article>
  ),
  image: ({ block }) => (
    <figure className="hiw-block hiw-block--image">
      {block.imageUrl ? (
        <img
          src={block.imageUrl}
          alt={block.title?.trim() || "صورة توضيحية"}
          className="hiw-block__image"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      {block.title ? <figcaption className="hiw-block__caption">{block.title}</figcaption> : null}
    </figure>
  ),
  text_image: ({ block, index }) => (
    <article className="hiw-block hiw-block--text-image">
      <div className="hiw-block__split">
        <div className="hiw-block__split-copy">
          <span className="hiw-block__step-num hiw-block__step-num--inline" aria-hidden="true">
            {index + 1}
          </span>
          {block.title ? <h3 className="hiw-block__step-title">{block.title}</h3> : null}
          {block.body ? <p className="hiw-block__step-text">{block.body}</p> : null}
        </div>
        {block.imageUrl ? (
          <div className="hiw-block__split-media">
            <img
              src={block.imageUrl}
              alt={block.title?.trim() || "صورة توضيحية"}
              className="hiw-block__image"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
      </div>
    </article>
  ),
};

export default function HowItWorksBlockRenderer({ blocks }) {
  if (!blocks.length) {
    return (
      <p className="hiw-page__empty">لا يوجد محتوى لعرضه حالياً.</p>
    );
  }

  let stepIndex = 0;

  return (
    <div className="hiw-page__blocks">
      {blocks.map((block) => {
        const Renderer = BLOCK_RENDERERS[block.blockType];
        if (!Renderer) return null;

        const usesStepNumber = block.blockType === "text" || block.blockType === "text_image";
        const index = usesStepNumber ? stepIndex : 0;
        if (usesStepNumber) stepIndex += 1;

        return (
          <div key={block.id} className="hiw-page__block-wrap">
            <Renderer block={block} index={index} />
          </div>
        );
      })}
    </div>
  );
}

export function HowItWorksPageShell({ page, blocks, children }) {
  return (
    <main className="hiw-page page-content" lang="ar" dir="rtl">
      <div className="hiw-page__inner">
        <PublicPageHeader title={page?.title || "طريقة العمل"} />
        {children || <HowItWorksBlockRenderer blocks={blocks} />}
      </div>
    </main>
  );
}
