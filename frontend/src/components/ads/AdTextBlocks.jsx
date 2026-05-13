/**
 * @param {import("../../types/ad.js").Ad} ad
 */
export default function AdTextBlocks({ ad }) {
  if (!Array.isArray(ad.texts) || ad.texts.length === 0) return null;
  return (
    <div className="mt-3 space-y-2" dir="rtl">
      {ad.texts.map((t) => (
        <p
          key={t.id}
          className="text-sm leading-relaxed"
          style={{
            color: t.color || ad.textColor || undefined,
            fontSize: t.fontSize || undefined,
            fontWeight: t.fontWeight || undefined,
            textAlign: ad.textAlign || "right",
          }}
        >
          {t.content}
        </p>
      ))}
    </div>
  );
}
