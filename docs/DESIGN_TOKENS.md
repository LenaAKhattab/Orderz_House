# Design Tokens — Orderz House

مرجع مستخرج من CSS الحالي (`frontend/src/index.css` وملفات الأنماط المرتبطة).  
**لا يغيّر هذا الملف التصميم** — للاستخدام لاحقًا عند بناء `ThemeData` في Flutter.

---

## الخط

| Token | القيمة |
|--------|--------|
| `--font-sans` | `"Cairo", "Segoe UI", Tahoma, system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, "Cascadia Code", "Segoe UI Mono", Consolas, monospace` |

### أوزان الخط

| Token | القيمة |
|--------|--------|
| `--font-weight-body` | 400 |
| `--font-weight-label` | 500 |
| `--font-weight-button` | 600 |
| `--font-weight-subheading` | 600 |
| `--font-weight-heading` | 700 |
| `--font-weight-display` | 800 |

### ارتفاع السطر

| Token | القيمة |
|--------|--------|
| `--line-height-body` | 1.6 |
| `--line-height-heading` | 1.35 |
| `--line-height-tight` | 1.25 |

---

## الألوان الأساسية

| الاسم | CSS variable | Hex / قيمة |
|--------|----------------|------------|
| Primary | `--primary` | `#2f3b65` |
| Secondary | `--secondary` | `#76cfdf` |
| Accent light | `--accent-light` | `#76cfdf` |
| Accent strong | `--accent-strong` | `#2f3b65` |

### Tailwind `@theme` (مرآة)

- `--color-primary`: `#2f3b65`
- `--color-secondary`: `#76cfdf`

---

## الخلفيات

| الاسم | Variable | القيمة |
|--------|-----------|--------|
| Card / surface | `--background` | `#ffffff` |
| Page canvas | `--page-bg` | `#f3f4f4` |
| Dashboard shell | `--dash-shell-bg` | `var(--page-bg)` |

---

## النصوص

| الاسم | Variable | القيمة |
|--------|-----------|--------|
| Main | `--text-main` | `#202020` |
| Muted | `--text-muted` | `#2f3b65` |
| خط فاصل | `--line` | `rgba(47, 59, 101, 0.2)` |

---

## Dashboard (لوحات التحكم)

| الاسم | Variable | القيمة |
|--------|-----------|--------|
| Hero gradient A–D | `--dash-hero-a` … `--dash-hero-d` | `#1a263f` → `#2f5c6a` |
| Orange mid / deep | `--dash-orange-mid`, `--dash-orange-deep` | `#e8873a`, `#c56a1c` |
| Icon chip bg | `--dash-icon-chip-bg` | `rgba(47, 59, 101, 0.08)` |
| Card border | `--dash-card-border` | `rgba(148, 163, 184, 0.32)` |

---

## Radius

| الاسم | Variable | القيمة |
|--------|-----------|--------|
| عام | `--radius` | `12px` |
| Dashboard surface | `--dash-surface-radius` | `18px` |
| Tailwind | `--radius-lg` | `12px` |

---

## Shadows

| الاسم | Variable |
|--------|-----------|
| Dashboard hero | `--dash-shadow-hero` |
| Dashboard hero bloom | `--dash-hero-bloom` |
| Dashboard aside | `--dash-shadow-aside` |
| Dashboard card | `--dash-card-shadow` |

---

## الحركة والتنقل العام

| الاسم | Variable |
|--------|-----------|
| Easing | `--ease-premium`: `cubic-bezier(0.33, 1, 0.68, 1)` |
| Nav morph | `--nav-morph-duration`: `0.7s` |
| Home nav stack height | `--home-nav-stack`: `84px` |
| Public nav z-index | `--public-nav-z` … `--public-nav-drawer-z` |

---

## Breakpoints (من ملفات CSS — غير موحّدة بالكامل)

| Breakpoint | الاستخدام الشائع |
|------------|------------------|
| `≤340px` | تصغير إضافي (services) |
| `≤520px` | services |
| `≤620px` | services |
| `≤639px` | public page header |
| `≤640px` | **Home / Plans mobile layouts** (مكونات منفصلة) |
| `641px–980px` | plans tablet |
| `≤768px` | services |
| `≤900px` | services |
| `≤960px` | services |
| `≤1023px` / `≥1024px` | services desktop/mobile split |

> ملاحظة: لا يوجد ملف breakpoints مركزي واحد — المرجع الأهم للموبايل هو `640px` في Home و Plans.

---

## RTL

- `body`: `direction: rtl; text-align: right;`
- أرقام معزولة: `.oh-num` (`unicode-bidi: isolate`)
- مبالغ مالية LTR: `.oh-money` (`direction: ltr`)

`LanguageProvider` يضبط `document.documentElement.dir` عند تبديل اللغة (عربي RTL / إنجليزي LTR).

---

## أهم ملفات تصميم الهاتف

| الملف | الدور |
|--------|--------|
| `frontend/src/index.css` | Tokens عالمية + RTL base |
| `frontend/src/styles/legacy-application.css` | قواعد legacy عامة |
| `frontend/src/components/sections/mobile/home-mobile-page.css` | الصفحة الرئيسية موبايل |
| `frontend/src/styles/plansPage.css` | الباقات (responsive) |
| `frontend/src/styles/servicesPage.css` | الخدمات |
| `frontend/src/styles/publicPageHeader.css` | هيدر الصفحات العامة |
| `frontend/src/components/layout/Navbar.jsx` + CSS مرتبط | هيدر + drawer |
| `frontend/src/styles/howItWorksPage.css` | صفحات كيف يعمل |

---

## اقتراح Flutter ThemeData (لاحقًا)

```dart
// مرجع تقريبي — لا يُطبَّق تلقائيًا
Color primary = Color(0xFF2F3B65);
Color secondary = Color(0xFF76CFDF);
Color pageBg = Color(0xFFF3F4F4);
Color textMain = Color(0xFF202020);
double radiusLg = 12;
double radiusDash = 18;
// fontFamily: 'Cairo'
```

---

*آخر تحديث: Phase 1 — Web Stabilization & Flutter Readiness*
