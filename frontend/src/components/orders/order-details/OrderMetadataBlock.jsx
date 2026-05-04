/**
 * Key–value list for secondary fields (below summary / in main column).
 * @param {{ label: string, value: string, dir?: string }[]} props.rows
 */
export default function OrderMetadataBlock({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="od-meta-rows">
      {rows.map((r) => (
        <div key={r.label} className="od-meta-row">
          <p className="od-meta-label">{r.label}</p>
          <p
            className="od-meta-value"
            dir={r.dir || "rtl"}
            style={r.dir ? { unicodeBidi: "plaintext" } : undefined}
          >
            {r.value || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
