/** Run query thunks with at most `limit` in flight: a report must never monopolise the pg pool (max 10). */
async function runLimited(thunks, limit = 3) {
  const out = new Array(thunks.length);
  let next = 0;
  const worker = async () => {
    while (next < thunks.length) {
      const i = next++;
      // eslint-disable-next-line no-await-in-loop
      out[i] = await thunks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

module.exports = { runLimited };
