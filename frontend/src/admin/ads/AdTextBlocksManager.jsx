import { FONT_SIZE_PRESETS, FONT_WEIGHT_PRESETS, TEXT_POSITION_OPTIONS } from "./adFormConstants";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random()}`;
}

/**
 * @param {object} p
 * @param {unknown[]} p.texts
 * @param {(next: unknown[]) => void} p.onChange
 */
export default function AdTextBlocksManager({ texts, onChange }) {
  const list = Array.isArray(texts) ? texts : [];

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
      <p className="oh-admin-ads__helperText">
        استخدم النصوص الإضافية لإضافة مميزات أو ملاحظات؛ ولون كل كتلة يُحدَّد بجانبها مباشرة.
      </p>
      {list.map((t, idx) => {
        const sizeKnown = FONT_SIZE_PRESETS.some((p) => p.value === t.fontSize);
        const weightKnown = FONT_WEIGHT_PRESETS.some((p) => p.value === t.fontWeight);
        const sizeSelectValue = sizeKnown ? t.fontSize : t.fontSize || FONT_SIZE_PRESETS[1].value;
        const weightSelectValue = weightKnown ? t.fontWeight : t.fontWeight || FONT_WEIGHT_PRESETS[0].value;

        return (
          <div key={t.id || idx} className="oh-admin-ads__card oh-admin-ads__text-card oh-admin-ads__text-card--compact">
            <div className="oh-admin-ads__image-card-head">
              <span className="oh-admin-ads__image-index">كتلة {idx + 1}</span>
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
                  نسخ الكتلة
                </button>
                <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => remove(idx)}>
                  حذف
                </button>
              </div>
            </div>

            <div className="oh-admin-ads__field oh-admin-ads__text-card__body-field">
              <label>نص إضافي</label>
              <textarea value={t.content || ""} onChange={(e) => update(idx, { content: e.target.value })} rows={3} />
            </div>

            <div className="oh-admin-ads__text-card__meta-grid">
              <div className="oh-admin-ads__field">
                <label>مكان النص</label>
                <select value={t.position || "middle"} onChange={(e) => update(idx, { position: e.target.value })}>
                  {TEXT_POSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="oh-admin-ads__field">
                <label>حجم الخط</label>
                <select value={sizeSelectValue} onChange={(e) => update(idx, { fontSize: e.target.value })}>
                  {FONT_SIZE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  {!sizeKnown && t.fontSize ? (
                    <option value={t.fontSize}>حجم محفوظ مسبقًا</option>
                  ) : null}
                </select>
              </div>
              <div className="oh-admin-ads__field">
                <label>سمك الخط</label>
                <select value={weightSelectValue} onChange={(e) => update(idx, { fontWeight: e.target.value })}>
                  {FONT_WEIGHT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  {!weightKnown && t.fontWeight ? (
                    <option value={t.fontWeight}>سمك محفوظ مسبقًا</option>
                  ) : null}
                </select>
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={add}>
        + إضافة كتلة نصية
      </button>
    </div>
  );
}
