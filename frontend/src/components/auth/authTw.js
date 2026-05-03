/**
 * Tailwind class bundles for auth screens (replaces legacy `.auth-*` CSS).
 * Keep exports as stable strings for reuse across Register / Login / ForgotPassword.
 */

/** @deprecated Auth shell moved to `auth-pages.css` (.oh-auth-page / .oh-auth-card). Kept for stray imports. */
export const authPage =
  "grid min-h-[calc(100vh-100px)] place-items-center py-[18px] pb-12 max-md:py-2.5 max-md:pb-[30px]";

export const authCardShell = "w-[min(1160px,calc(100%-40px))]";

export const authCard = "grid min-h-0 grid-cols-1 [direction:ltr]";

export const authNavbarWrap = "bg-transparent py-6 pb-2";

export const authNavbar =
  "flex min-h-[68px] flex-wrap items-center justify-between gap-[22px] rounded-full border border-[rgba(47,59,101,0.1)] bg-white/90 px-[18px] py-2.5 shadow-[0_12px_40px_-18px_rgba(24,36,64,0.12)] backdrop-blur-md max-md:flex-wrap max-md:justify-center max-md:rounded-[22px] max-md:px-3 max-md:py-3 max-sm:gap-2.5 max-sm:p-2.5";

export const authBrand =
  "text-[0.95rem] font-bold tracking-wide text-[#141d44] no-underline max-sm:text-[0.82rem]";

export const authNavList =
  "m-0 flex list-none flex-wrap items-center justify-center gap-5 max-md:gap-3";

export const authNavLink =
  "text-[0.88rem] font-medium text-[#3f4a67] no-underline transition-colors hover:text-[#2f3b65] max-sm:text-[0.82rem]";

export const authNavbarActions =
  "flex items-center gap-2 max-md:w-full max-md:justify-center";

export const authSigninLink =
  "px-3 py-2 text-[0.85rem] font-bold text-[#243153] no-underline max-sm:text-[0.82rem]";

/** Extra classes for Button alongside `btn btn-primary` */
export const authStartBtn = "min-h-[38px] rounded-full px-3.5 text-[0.85rem] md:min-h-[42px] md:px-[18px]";

/** Visual + form shells live in `auth-pages.css` (.oh-auth-*). */
export const authVisualPanel = "";
export const authVisualGlow = "";
export const authVisualContent = "";
export const authVisualTitle = "";
export const authVisualDesc = "";
export const authQuoteCard = "";
export const authQuoteText = "";
export const authPersonRow = "";
export const authAvatar = "";
export const authPersonStrong = "";
export const authPersonSpan = "";
export const authDots = "";
export const authDotBar = "";
export const authDotSmall = "";
export const authFormPanel = "";
export const authFormHeader = "";
export const authFormTitle = "";
export const authFormSubtitle = "";

export const authHelperText = "text-[0.82rem] text-[#7a839a]";

export const authFormError =
  "m-0 rounded-[14px] border border-[rgba(180,50,50,0.18)] bg-[rgba(180,50,50,0.06)] px-3.5 py-3 text-right text-[0.9rem] leading-[1.45] text-[#8b2222]";

export const authSubtleLink =
  "text-[0.8rem] font-bold text-[#5e6b8f] no-underline transition-colors hover:text-[#2f3b65]";

export const authFooterNote = "mt-1 text-[0.9rem] text-[#6f7992]"; /* superseded by .oh-auth-footer-note in AuthFormCard */

export const authInlineLink =
  "font-bold text-[#2f3b65] no-underline hover:underline";

export const authFormGrid = "grid gap-3.5";

export const authField = "grid gap-2";

export const authFieldCheckbox =
  "flex flex-row items-start gap-2.5 [direction:rtl] [&>input]:mt-1 [&>input]:h-[18px] [&>input]:w-[18px] [&>input]:shrink-0 [&>input]:accent-[#2f3b65]";

export const authFieldLabel = "text-[0.86rem] font-bold text-[#2c3658]";

export const authFieldHead = "flex items-center justify-between gap-2.5";

export const authInputWrap = "relative";

export const authInputIcon =
  "pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[0.88rem] not-italic text-[#7c86a4]";

const inputBase =
  "w-full min-h-[52px] rounded-2xl border border-[rgba(47,59,101,0.14)] bg-[#f9fafc] py-3 text-[0.92rem] text-[#1a2238] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[#8e96ae] focus:border-[var(--secondary,#76cfdf)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(118,207,223,0.18)] focus:outline-none";

/** Default: room for start icon */
export const authInput = `${inputBase} ps-10 pe-3.5`;

/** No leading icon */
export const authInputNoIcon = `${inputBase} px-3.5`;

export const authSelectRoot = "relative w-full";

export const authSelectBtn =
  "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-[rgba(47,59,101,0.14)] bg-[#f9fafc] py-3 pe-11 ps-3.5 text-right text-[0.92rem] text-[#1a2238] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[rgba(47,59,101,0.22)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-90";

export const authSelectBtnOpen =
  "border-[var(--secondary,#76cfdf)] bg-white shadow-[0_0_0_4px_rgba(118,207,223,0.2)] outline-none";

export const authSelectText =
  "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#1f2848]";

export const authSelectPlaceholder = "font-semibold text-[#98a2bd]";

export const authSelectChev =
  "h-[18px] w-[18px] shrink-0 bg-[length:18px] bg-center bg-no-repeat transition-transform [background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 10l5 5 5-5' stroke='%237c86a4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")]";

export const authSelectChevOpen = "rotate-180";

export const authSelectPanel =
  "absolute inset-x-0 top-[calc(100%+8px)] z-[200] overflow-hidden rounded-[16px] border border-[rgba(47,59,101,0.1)] bg-white shadow-[0_24px_50px_-12px_rgba(24,36,64,0.18)]";

export const authSelectOptions = "max-h-[280px] overflow-auto p-1.5";

export const authSelectOpt =
  "flex w-full appearance-none items-center justify-between gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2.5 text-right text-[#1f2848] transition-colors hover:bg-[rgba(56,82,180,0.06)]";

export const authSelectOptSelected =
  "bg-[rgba(240,141,57,0.12)] font-extrabold text-[#1b2341]";

export const authSelectOptText =
  "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";

/** LTR phone / dial selects */
export const authSelectLtrRoot = "ltr text-left";

export const authSelectBtnLtr = "py-3 ps-11 pe-3.5 text-left";

export const authSelectOptLtr = "text-left";

export const authTermsText = "leading-[1.55]";

export const authSubmitBtn =
  "w-full min-h-[54px] cursor-pointer rounded-2xl border-0 bg-gradient-to-l from-[#2a3558] via-[#2f3b65] to-[#354770] px-4 py-2.5 text-base font-bold text-white shadow-[0_10px_28px_-8px_rgba(47,59,101,0.45)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-6px_rgba(47,59,101,0.38)] hover:brightness-[1.05] active:translate-y-0 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none";

export const authSteps =
  "grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-[18px] border border-[rgba(47,59,101,0.1)] bg-gradient-to-b from-[rgba(118,207,223,0.08)] to-[rgba(47,59,101,0.04)] p-2.5 max-sm:gap-2";

export const authStep =
  "flex cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border-0 bg-transparent px-2.5 py-2.5 transition-[background-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-85";

export const authStepActive =
  "bg-white shadow-[0_8px_24px_-6px_rgba(24,36,64,0.14)] ring-1 ring-[rgba(47,59,101,0.06)]";

export const authStepNum =
  "grid h-[28px] w-[28px] place-items-center rounded-full bg-gradient-to-br from-[#2f3b65] to-[#1e2947] text-[0.88rem] font-extrabold text-white shadow-[0_2px_8px_rgba(47,59,101,0.35)]";

export const authStepLabel = "text-[0.88rem] font-extrabold text-[#2c3658]";

export const authStepDivider =
  "h-0.5 w-16 rounded-full bg-[rgba(47,59,101,0.14)] max-sm:w-11";

export const authStepDividerDone =
  "bg-gradient-to-l from-[rgba(118,207,223,0.55)] to-[rgba(240,141,57,0.9)]";

export const authActionsRow = "grid gap-2.5";

export const authActionsRowSplit =
  "grid grid-cols-1 items-center gap-3 sm:grid-cols-[0.75fr_1.25fr]";

export const authRow = "grid gap-3.5";

export const authRow3 = "grid-cols-1 gap-3.5 sm:grid-cols-3";

export const authNavBtn =
  "w-full min-h-[52px] cursor-pointer rounded-2xl border border-[rgba(47,59,101,0.18)] bg-white/80 px-4 py-2.5 text-base font-semibold text-[#2f3b65] shadow-[0_2px_12px_-4px_rgba(24,36,64,0.08)] backdrop-blur-sm transition-[background-color,box-shadow] hover:bg-[rgba(118,207,223,0.12)] hover:border-[rgba(118,207,223,0.35)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export const authSplitRow =
  "grid grid-cols-1 items-start gap-2.5 [direction:ltr] sm:grid-cols-[0.9fr_1.1fr]";

export const authSplitItem = "min-w-0";

export const authLtr = "ltr";

export const authFieldHint = "mt-2 block text-[0.82rem] leading-normal text-[#6f7992]";

export const authFieldHintWarn = "text-[#8b2222]";

export const authSrOnly =
  "absolute m-[-1px] h-px w-px overflow-hidden border-0 p-0 [clip:rect(0,0,0,0)] whitespace-nowrap";

export const authCategories = "mt-2 flex flex-wrap gap-x-4 gap-y-2.5";

export const authCategoryItem =
  "inline-flex cursor-pointer items-center gap-2 text-[0.92rem] text-[#202020] [&_input]:h-[18px] [&_input]:w-[18px] [&_input]:accent-[#2f3b65]";

export const authRouteLoading =
  "flex min-h-[40vh] flex-col items-center justify-center gap-3 text-[0.95rem] text-[#76cfdf]";

export const authRouteLoadingSkel = "gap-0";

export const authRouteSkel = "grid w-[min(440px,92vw)] justify-items-center gap-3";

export const authRouteLoadingDot =
  "h-2.5 w-2.5 animate-pulse rounded-full bg-[#2f3b65] [animation-duration:0.9s]";
