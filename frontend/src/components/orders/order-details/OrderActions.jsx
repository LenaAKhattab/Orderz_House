/** Bottom action strip (pool take / bid, etc.). */
export default function OrderActions({ children, sticky = false }) {
  if (children == null) return null;
  return (
    <footer className={`od-actions-footer${sticky ? " od-actions-footer--sticky" : ""}`.trim()}>
      <div className="od-actions-footer__inner">{children}</div>
    </footer>
  );
}
