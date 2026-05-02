/**
 * Tailwind class bundles for auth screens (replaces legacy `.auth-*` CSS).
 * Keep exports as stable strings for reuse across Register / Login / ForgotPassword.
 */

export const authPage =
  "grid min-h-[calc(100vh-100px)] place-items-center bg-[#f7f8fc] py-[18px] pb-12 max-md:py-2.5 max-md:pb-[30px]";

export const authCardShell = "w-[min(1160px,calc(100%-40px))]";

export const authCard =
  "grid min-h-0 grid-cols-1 overflow-hidden rounded-[28px] border border-[rgba(56,82,180,0.14)] bg-white shadow-[0_30px_60px_rgba(24,36,85,0.16)] [direction:ltr] md:grid-cols-[1.08fr_1fr] md:min-h-[clamp(520px,72vh,640px)] max-md:min-h-0";

export const authNavbarWrap = "bg-[#f7f8fc] py-6 pb-2";

export const authNavbar =
  "flex min-h-[68px] flex-wrap items-center justify-between gap-[22px] rounded-full border border-[rgba(56,82,180,0.12)] bg-white px-[18px] py-2.5 shadow-[0_16px_34px_rgba(56,82,180,0.09)] max-md:flex-wrap max-md:justify-center max-md:rounded-[20px] max-md:px-3 max-md:py-3 max-sm:gap-2.5 max-sm:p-2.5";

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

export const authVisualPanel =
  "relative min-h-[300px] overflow-hidden bg-gradient-to-br from-[#273b88] from-0% via-[#3852b4] via-[42%] to-[#5e7ac4] to-100% px-[clamp(30px,5vw,56px)] py-[clamp(30px,5vw,56px)] text-right text-[#f4f7ff] [direction:rtl] max-md:min-h-[300px] max-sm:px-[18px] max-sm:py-6";

export const authVisualGlow =
  "pointer-events-none absolute -bottom-[120px] -left-[60px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(240,141,57,0.42)_0%,rgba(243,190,122,0.2)_35%,rgba(240,141,57,0)_72%)]";

export const authVisualContent =
  "relative z-[1] grid max-w-[420px] gap-5 max-md:max-w-full";

export const authVisualTitle =
  "m-0 text-[clamp(1.55rem,2.3vw,2.15rem)] font-bold leading-[1.35] text-white";

export const authVisualDesc =
  "m-0 text-[0.95rem] leading-[1.8] text-[rgba(236,240,255,0.92)]";

export const authQuoteCard =
  "mt-2 grid gap-3.5 rounded-[18px] border border-white/20 bg-white/[0.08] p-5 backdrop-blur-[5px]";

export const authQuoteText = "m-0 text-[0.92rem] text-[rgba(249,250,255,0.96)]";

export const authPersonRow = "flex items-center gap-2.5";

export const authAvatar =
  "grid h-[34px] w-[34px] place-items-center rounded-full border border-[rgba(243,190,122,0.48)] bg-[rgba(240,141,57,0.26)] text-[0.88rem] font-bold text-white";

export const authPersonStrong = "block text-[0.92rem] font-bold";

export const authPersonSpan = "block text-[0.82rem] text-[rgba(231,236,255,0.86)]";

export const authDots = "mt-2 flex items-center gap-[7px]";

export const authDotBar = "h-1.5 w-4 rounded-full bg-[rgba(240,141,57,0.95)]";

export const authDotSmall = "h-1.5 w-1.5 rounded-full bg-white/35";

export const authFormPanel =
  "grid content-center gap-5 bg-white px-[clamp(28px,4.4vw,56px)] py-[clamp(28px,4.4vw,56px)] text-right [direction:rtl] max-sm:px-[18px] max-sm:py-6";

export const authFormHeader = "grid gap-2";

export const authFormTitle =
  "m-0 text-[clamp(1.6rem,2.3vw,2.05rem)] font-bold leading-tight text-[#1b2341] max-sm:text-[1.45rem]";

export const authFormSubtitle = "m-0 text-[0.9rem] text-[#67738f]";

export const authHelperText = "text-[0.82rem] text-[#7a839a]";

export const authFormError =
  "m-0 rounded-[12px] bg-[rgba(180,50,50,0.08)] px-3 py-2.5 text-right text-[0.9rem] leading-[1.45] text-[#8b2222]";

export const authSubtleLink =
  "text-[0.8rem] font-bold text-[#5e6b8f] no-underline transition-colors hover:text-[#2f3b65]";

export const authFooterNote = "mt-1 text-[0.9rem] text-[#6f7992]";

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
  "w-full min-h-[52px] rounded-xl border border-[rgba(56,82,180,0.18)] bg-[#fdfdff] py-3 text-[0.92rem] text-[#1f2848] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[#98a2bd] focus:border-[#2f3b65] focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,82,180,0.14)] focus:outline-none";

/** Default: room for start icon */
export const authInput = `${inputBase} ps-10 pe-3.5`;

/** No leading icon */
export const authInputNoIcon = `${inputBase} px-3.5`;

export const authSelectRoot = "relative w-full";

export const authSelectBtn =
  "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[rgba(56,82,180,0.18)] bg-[#fdfdff] py-3 pe-11 ps-3.5 text-right text-[0.92rem] text-[#1f2848] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[rgba(56,82,180,0.32)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-90";

export const authSelectBtnOpen =
  "border-[#2f3b65] bg-white shadow-[0_0_0_4px_rgba(56,82,180,0.14)] outline-none";

export const authSelectText =
  "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#1f2848]";

export const authSelectPlaceholder = "font-semibold text-[#98a2bd]";

export const authSelectChev =
  "h-[18px] w-[18px] shrink-0 bg-[length:18px] bg-center bg-no-repeat transition-transform [background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 10l5 5 5-5' stroke='%237c86a4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")]";

export const authSelectChevOpen = "rotate-180";

export const authSelectPanel =
  "absolute inset-x-0 top-[calc(100%+8px)] z-[200] overflow-hidden rounded-[14px] border border-[rgba(56,82,180,0.14)] bg-white shadow-[0_22px_46px_rgba(24,36,85,0.16)]";

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
  "w-full min-h-[52px] cursor-pointer rounded-xl border-0 bg-[#2f3b65] px-4 py-2.5 text-base font-bold text-white transition-colors duration-[250ms] hover:bg-[#76cfdf] disabled:cursor-not-allowed disabled:opacity-60";

export const authSteps =
  "grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-2xl border border-[rgba(56,82,180,0.12)] bg-[rgba(56,82,180,0.04)] p-2.5 max-sm:gap-2";

export const authStep =
  "flex cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border-0 bg-transparent px-2.5 py-2.5 transition-[background-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-85";

export const authStepActive = "bg-white shadow-[0_10px_22px_rgba(56,82,180,0.12)]";

export const authStepNum =
  "grid h-[26px] w-[26px] place-items-center rounded-full bg-[#2f3b65] text-[0.9rem] font-extrabold text-white";

export const authStepLabel = "text-[0.88rem] font-extrabold text-[#2c3658]";

export const authStepDivider =
  "h-0.5 w-16 rounded-full bg-[rgba(56,82,180,0.18)] max-sm:w-11";

export const authStepDividerDone = "bg-[rgba(240,141,57,0.85)]";

export const authActionsRow = "grid gap-2.5";

export const authActionsRowSplit =
  "grid grid-cols-1 items-center gap-3 sm:grid-cols-[0.75fr_1.25fr]";

export const authRow = "grid gap-3.5";

export const authRow3 = "grid-cols-1 gap-3.5 sm:grid-cols-3";

export const authNavBtn =
  "w-full min-h-[52px] cursor-pointer rounded-xl border border-[rgba(47,59,101,0.2)] bg-transparent px-4 py-2.5 text-base font-semibold text-[#2f3b65] transition-colors hover:bg-[rgba(56,82,180,0.08)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

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
