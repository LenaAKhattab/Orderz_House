/** Dev-only timing helpers — no production overhead unless PERF_LOG=1. */
function perfEnabled() {
  if (String(process.env.PERF_LOG || "").trim() === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function perfLog(component, event, fields = {}) {
  if (!perfEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ component, event, ts: Date.now(), ...fields }));
}

function perfStart(component, label) {
  if (!perfEnabled()) return { end: () => {} };
  const started = Date.now();
  return {
    end(extra = {}) {
      perfLog(component, label, { durationMs: Date.now() - started, ...extra });
    },
  };
}

module.exports = { perfEnabled, perfLog, perfStart };
