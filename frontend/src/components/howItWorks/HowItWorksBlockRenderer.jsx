import PublicPageHeader from "../layout/PublicPageHeader";
import { useTranslation } from "../../i18n/LanguageProvider";
import { pickLocalizedPlatformCopy } from "../../lib/i18n/platformContentLocale";

function localizedBlock(block, locale) {
  if (!block || locale !== "en") return block;
  return {
    ...block,
    title: pickLocalizedPlatformCopy(block.title, block.titleEn || block.title_en, locale),
    body: pickLocalizedPlatformCopy(block.body, block.bodyEn || block.body_en, locale),
  };
}

function HiwImageFigure({ block }) {
  const { t } = useTranslation();
  const altFallback = t("home.hiw.illustrationAlt");
  return (
    <figure className="hiw-block hiw-block--image">
      {block.imageUrl ? (
        <img
          src={block.imageUrl}
          alt={block.title?.trim() || altFallback}
          className="hiw-block__image"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      {block.title ? <figcaption className="hiw-block__caption">{block.title}</figcaption> : null}
    </figure>
  );
}

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
  image: ({ block }) => <HiwImageFigure block={block} />,
  text_image: ({ block, index }) => <HiwTextImageBlock block={block} index={index} />,
};

function HiwTextImageBlock({ block, index }) {
  const { t } = useTranslation();
  const altFallback = t("home.hiw.illustrationAlt");
  return (
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
              alt={block.title?.trim() || altFallback}
              className="hiw-block__image"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function HowItWorksBlockRenderer({ blocks }) {
  const { t, locale } = useTranslation();
  if (!blocks.length) {
    return <p className="hiw-page__empty">{t("home.hiw.empty")}</p>;
  }

  let stepIndex = 0;

  return (
    <div className="hiw-page__blocks">
      {blocks.map((block) => {
        const localized = localizedBlock(block, locale);
        const Renderer = BLOCK_RENDERERS[localized.blockType];
        if (!Renderer) return null;

        const usesStepNumber = localized.blockType === "text" || localized.blockType === "text_image";
        const index = usesStepNumber ? stepIndex : 0;
        if (usesStepNumber) stepIndex += 1;

        return (
          <div key={block.id} className="hiw-page__block-wrap">
            <Renderer block={localized} index={index} />
          </div>
        );
      })}
    </div>
  );
}

export function HowItWorksPageShell({ page, blocks, children }) {
  const { t, locale, dir } = useTranslation();
  const title = pickLocalizedPlatformCopy(page?.title, page?.titleEn || page?.title_en, locale);
  return (
    <main className="hiw-page page-content" lang={locale === "en" ? "en" : "ar"} dir={dir || (locale === "en" ? "ltr" : "rtl")}>
      <div className="hiw-page__inner">
        <PublicPageHeader title={title || t("home.hiw.defaultTitle")} />
        {children || <HowItWorksBlockRenderer blocks={blocks} />}
      </div>
    </main>
  );
}
