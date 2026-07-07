export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function calcStripeFeeAmount(grossAmount, stripePercentage, stripeFixedFee) {
  return roundMoney((Number(grossAmount) * Number(stripePercentage)) / 100 + Number(stripeFixedFee || 0));
}

export function calcNetAfterStripe(grossAmount, stripeDeductionEnabled, stripePercentage, stripeFixedFee) {
  const gross = roundMoney(grossAmount);
  if (!stripeDeductionEnabled) return gross;
  return roundMoney(Math.max(0, gross - calcStripeFeeAmount(gross, stripePercentage, stripeFixedFee)));
}

export function calcBonusPoolAmount(netAmountAfterStripe, bonusPercentage) {
  return roundMoney((Number(netAmountAfterStripe) * Number(bonusPercentage)) / 100);
}

export function calcAllocationAmount(bonusPoolAmount, percentageShare) {
  return roundMoney((Number(bonusPoolAmount) * Number(percentageShare)) / 100);
}

export function sumSharePercentages(allocations) {
  return roundMoney((allocations || []).reduce((s, a) => s + Number(a.percentageShare || 0), 0));
}

export function computeBonusPreview(form) {
  const grossAmount = roundMoney(form.grossAmount);
  const stripeDeductionEnabled = Boolean(form.stripeDeductionEnabled);
  const stripePercentage = roundMoney(form.stripePercentage || 0);
  const stripeFixedFee = roundMoney(form.stripeFixedFee || 0);
  const bonusPercentage = roundMoney(form.bonusPercentage || 0);
  const stripeFeeAmount = stripeDeductionEnabled
    ? calcStripeFeeAmount(grossAmount, stripePercentage, stripeFixedFee)
    : 0;
  const netAmountAfterStripe = calcNetAfterStripe(
    grossAmount,
    stripeDeductionEnabled,
    stripePercentage,
    stripeFixedFee,
  );
  const bonusPoolAmount = calcBonusPoolAmount(netAmountAfterStripe, bonusPercentage);
  const allocations = (form.allocations || []).map((a) => ({
    ...a,
    calculatedAmount: calcAllocationAmount(bonusPoolAmount, a.percentageShare),
  }));
  const shareTotal = sumSharePercentages(allocations);
  return {
    grossAmount,
    stripeFeeAmount,
    netAmountAfterStripe,
    bonusPoolAmount,
    allocations,
    shareTotal,
  };
}

export function currentMonthKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

export function monthOptions(count = 12) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i += 1) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
