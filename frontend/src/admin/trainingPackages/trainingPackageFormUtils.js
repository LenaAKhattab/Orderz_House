export function featuresToText(list) {
  return Array.isArray(list) ? list.join("\n") : "";
}

export function textToFeatures(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function getInitialTrainingPackageForm(pkg = null) {
  if (!pkg) {
    return {
      code: "",
      nameAr: "",
      nameEn: "",
      shortDescAr: "",
      shortDescEn: "",
      priceJod: "",
      durationMonths: "",
      accent: "basic",
      featured: false,
      isVisible: true,
      badgeAr: "",
      badgeEn: "",
      featuresAr: "",
      featuresEn: "",
      whatsappMessageAr: "",
    };
  }
  return {
    code: pkg.code || pkg.id || "",
    nameAr: pkg.nameAr || "",
    nameEn: pkg.nameEn || "",
    shortDescAr: pkg.shortDescAr || "",
    shortDescEn: pkg.shortDescEn || "",
    priceJod: pkg.priceJod ?? "",
    durationMonths: pkg.durationMonths ?? "",
    accent: pkg.accent || "basic",
    featured: Boolean(pkg.featured),
    isVisible: pkg.isVisible !== false,
    badgeAr: pkg.badgeAr || "",
    badgeEn: pkg.badgeEn || "",
    featuresAr: featuresToText(pkg.featuresAr),
    featuresEn: featuresToText(pkg.featuresEn),
    whatsappMessageAr: pkg.whatsappMessageAr || "",
  };
}

export function normalizeTrainingPackagePayload(form) {
  const durationRaw = String(form.durationMonths ?? "").trim();
  return {
    code: String(form.code || "").trim().toLowerCase(),
    nameAr: String(form.nameAr || "").trim(),
    nameEn: String(form.nameEn || "").trim(),
    shortDescAr: String(form.shortDescAr || "").trim(),
    shortDescEn: String(form.shortDescEn || "").trim(),
    priceJod: Number(form.priceJod),
    durationMonths: durationRaw === "" ? null : Number(durationRaw),
    accent: form.accent || "basic",
    featured: Boolean(form.featured),
    isVisible: form.isVisible !== false,
    badgeAr: String(form.badgeAr || "").trim(),
    badgeEn: String(form.badgeEn || "").trim(),
    featuresAr: textToFeatures(form.featuresAr),
    featuresEn: textToFeatures(form.featuresEn),
    whatsappMessageAr: String(form.whatsappMessageAr || "").trim(),
  };
}

export function canSubmitTrainingPackage(form) {
  const payload = normalizeTrainingPackagePayload(form);
  return Boolean(payload.code && payload.nameAr && Number.isFinite(payload.priceJod) && payload.priceJod >= 0);
}

export function buildTrainingReorderCodes(packages, code, direction) {
  const list = Array.isArray(packages) ? packages.map((pkg) => pkg.code) : [];
  const idx = list.indexOf(code);
  if (idx < 0) return null;
  const next = direction === "up" ? idx - 1 : idx + 1;
  if (next < 0 || next >= list.length) return null;
  const copy = [...list];
  const tmp = copy[idx];
  copy[idx] = copy[next];
  copy[next] = tmp;
  return copy;
}
