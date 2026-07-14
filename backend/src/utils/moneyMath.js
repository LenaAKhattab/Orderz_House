/**
 * Safe money math — avoid floating-point drift; round to 2 decimal places.
 */

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(toNum(value) * 100) / 100;
}

function calcStripeFeeAmount(grossAmount, stripePercentage, stripeFixedFee) {
  const gross = toNum(grossAmount);
  const pct = toNum(stripePercentage);
  const fixed = toNum(stripeFixedFee);
  return roundMoney((gross * pct) / 100 + fixed);
}

function calcNetAfterStripe(grossAmount, stripeDeductionEnabled, stripePercentage, stripeFixedFee) {
  const gross = roundMoney(grossAmount);
  if (!stripeDeductionEnabled) return gross;
  const fee = calcStripeFeeAmount(gross, stripePercentage, stripeFixedFee);
  return roundMoney(Math.max(0, gross - fee));
}

function calcBonusPoolAmount(netAmountAfterStripe, bonusPercentage) {
  return roundMoney((toNum(netAmountAfterStripe) * toNum(bonusPercentage)) / 100);
}

function calcAllocationAmount(bonusPoolAmount, percentageShare) {
  return roundMoney((toNum(bonusPoolAmount) * toNum(percentageShare)) / 100);
}

function sumPercentages(allocations) {
  return roundMoney(
    (allocations || []).reduce((sum, a) => sum + toNum(a.percentageShare ?? a.percentage_share), 0),
  );
}

module.exports = {
  toNum,
  roundMoney,
  calcStripeFeeAmount,
  calcNetAfterStripe,
  calcBonusPoolAmount,
  calcAllocationAmount,
  sumPercentages,
};
