import { useMemo } from "react";
import { FONT_SIZE_PRESETS, FONT_WEIGHT_PRESETS, TEXT_POSITION_OPTIONS } from "./adFormConstants";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random()}`;
}

/**
 * @param {object} p
 * @param {unknown[]} p.texts
 * @param {(next: unknown[]) => void} p.onChange
 */
export default function AdTextBlocksManager({ texts, onChange }) {
  const { t } = useTranslation();
  const list = Array.isArray(texts) ? texts : [];

  const positionOptions = useMemo(
    () =>
      TEXT_POSITION_OPTIONS.map((o) => ({
        ...o,
        label: t(`ads.positions.${o.positionKey}`),
      })),
    [t],
  );

  const fontSizeOptions = useMemo(
    () =>
      FONT_SIZE_PRESETS.map((p) => ({
        ...p,
        label: t(`ads.fontSize.${p.sizeKey}`),
      })),
    [t],
  );

  const fontWeightOptions = useMemo(
    () =>
      FONT_WEIGHT_PRESETS.map((p) => ({
        ...p,
        label: t(`ads.fontWeight.${p.weightKey}`),
      })),
    [t],
  );

  const update = (idx, patch) => {
    const next = list.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange(next);
  };

  const remove = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...list, { id: uid(), content: "", position: "middle", color: "" }]);
  };

  const duplicate = (idx) => {
    const row = list[idx];
    if (!row) return;
    const copy = { ...row, id: uid(), content: row.content || "" };
    const next = [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)];
    onChange(next);
  };

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="oh-admin-ads__text-stack">
      <p className="oh-admin-ads__helperText">{t("ads.textBlocks.hint")}</p>
      {list.map((row, idx) => {
        const sizeKnown = fontSizeOptions.some((p) => p.value === row.fontSize);
        const weightKnown = fontWeightOptions.some((p) => p.value === row.fontWeight);
        const sizeSelectValue = sizeKnown ? row.fontSize : row.fontSize || fontSizeOptions[1].value;
        const weightSelectValue = weightKnown ? row.fontWeight : row.fontWeight || fontWeightOptions[0].value;

        return (
          <div key={row.id || idx} className="oh-admin-ads__card oh-admin-ads__text-card oh-admin-ads__text-card--compact">
            <div className="oh-admin-ads__image-card-head">
              <span className="oh-admin-ads__image-index">{t("ads.textBlocks.blockIndex", { index: idx + 1 })}</span>
              <div className="oh-admin-ads__image-card-actions">
                <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => move(idx, -1)} disabled={idx === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-secondary oh-admin-ads__mini-btn"
                  onClick={() => move(idx, 1)}
                  disabled={idx === list.length - 1}
                >
                  ↓
                </button>
                <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => duplicate(idx)}>
                  {t("ads.textBlocks.duplicate")}
                </button>
                <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => remove(idx)}>
                  {t("ads.common.delete")}
                </button>
              </div>
            </div>

            <div className="oh-admin-ads__field oh-admin-ads__text-card__body-field">
              <label>{t("ads.textBlocks.extraText")}</label>
              <textarea value={row.content || ""} onChange={(e) => update(idx, { content: e.target.value })} rows={3} />
            </div>

            <div className="oh-admin-ads__text-card__meta-grid">
              <div className="oh-admin-ads__field">
                <label>{t("ads.textBlocks.textPosition")}</label>
                <select value={row.position || "middle"} onChange={(e) => update(idx, { position: e.target.value })}>
                  {positionOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="oh-admin-ads__field">
                <label>{t("ads.textBlocks.fontSize")}</label>
                <select value={sizeSelectValue} onChange={(e) => update(idx, { fontSize: e.target.value })}>
                  {fontSizeOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  {!sizeKnown && row.fontSize ? (
                    <option value={row.fontSize}>{t("ads.form.savedFontSize")}</option>
                  ) : null}
                </select>
              </div>
              <div className="oh-admin-ads__field">
                <label>{t("ads.textBlocks.fontWeight")}</label>
                <select value={weightSelectValue} onChange={(e) => update(idx, { fontWeight: e.target.value })}>
                  {fontWeightOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  {!weightKnown && row.fontWeight ? (
                    <option value={row.fontWeight}>{t("ads.form.savedFontWeight")}</option>
                  ) : null}
                </select>
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={add}>
        {t("ads.textBlocks.addBlock")}
      </button>
    </div>
  );
}
