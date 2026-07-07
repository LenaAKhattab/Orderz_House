/**
 * @param {{ slug?: string | null, name?: string | null, departmentSlug?: string | null, departmentName?: string | null }} dept
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getFinancialDepartmentLabel(dept, t) {
  if (!dept) return "—";
  const slug = dept.slug || dept.departmentSlug;
  const name = dept.name || dept.departmentName || dept.department;
  if (slug) {
    const key = `dashboard.financialCenter.departments.${slug}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return name || "—";
}

/**
 * @param {{ id: string, name: string, slug?: string | null }} dept
 * @param {(key: string) => string} t
 */
export function departmentOptionLabel(dept, t) {
  return getFinancialDepartmentLabel(dept, t);
}
