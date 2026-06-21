/**
 * Non-blocking UI warnings for confusing plan combinations (frontend only).
 * @param {Record<string, unknown>} form
 * @returns {{ key: string; messageKey: "warningSelfPurchase" | "warningOrderRange" }[]}
 */
export function getPlanFormWarnings(form) {
  const warnings = [];

  if (form?.selfSubscribeAllowed) {
    const priceRaw = form.priceJod;
    const stripeRaw = form.stripeCheckoutAmountJod;
    const price = priceRaw === "" || priceRaw == null ? null : Number(priceRaw);
    const stripe = stripeRaw === "" || stripeRaw == null ? null : Number(stripeRaw);
    const effective =
      stripe != null && Number.isFinite(stripe) && stripe > 0
        ? stripe
        : price != null && Number.isFinite(price) && price > 0
          ? price
          : 0;
    if (!effective || effective <= 0) {
      warnings.push({ key: "self-purchase-no-price", messageKey: "warningSelfPurchase" });
    }
  }

  const minRaw = form?.orderValueMinJod;
  const maxRaw = form?.orderValueMaxJod;
  const min = minRaw === "" || minRaw == null ? null : Number(minRaw);
  const max = maxRaw === "" || maxRaw == null ? null : Number(maxRaw);
  if (
    min != null &&
    max != null &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min > max
  ) {
    warnings.push({ key: "order-range", messageKey: "warningOrderRange" });
  }

  return warnings;
}
