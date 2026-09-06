const { resolvePublicGeoFromRequest } = require("../utils/publicGeoCountry");
const {
  BASE_CURRENCY,
  DISPLAY_DISCLAIMER_AR,
  OFFICIAL_CURRENCY_COPY_AR,
  INDICATIVE_COPY_AR,
  resolveDisplayCurrencyChoice,
} = require("../constants/displayCurrencies");
const { getRateFromJod } = require("../services/exchangeRateService");

async function getPublicCurrencyDisplay(req, res, next) {
  try {
    const geo = resolvePublicGeoFromRequest(req);
    const preferred = req.query?.preferred;
    const choice = resolveDisplayCurrencyChoice({
      preferred,
      countryCode: geo.countryCode,
    });

    let rate = null;
    if (choice.displayCurrency === BASE_CURRENCY) {
      rate = 1;
    } else {
      rate = await getRateFromJod(choice.displayCurrency);
    }

    const payload = {
      baseCurrency: BASE_CURRENCY,
      displayCurrency: choice.displayCurrency,
      rate: rate != null && Number.isFinite(rate) && rate > 0 ? Number(rate.toFixed(6)) : null,
      detectedCountry: geo.countryCode,
      source: choice.source,
      disclaimer: DISPLAY_DISCLAIMER_AR,
      officialCurrencyCopy: OFFICIAL_CURRENCY_COPY_AR,
      indicativeCopy: INDICATIVE_COPY_AR,
    };

    if (payload.rate == null && choice.displayCurrency !== BASE_CURRENCY) {
      payload.displayCurrency = BASE_CURRENCY;
      payload.rate = 1;
    }

    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicCurrencyDisplay,
};
