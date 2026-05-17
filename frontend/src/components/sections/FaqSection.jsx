import { useState } from "react";

/** RTL accordion — questions / answers (static copy). */
const FAQ_ITEMS = [
  {
    id: "trust",
    q: "هل أوردرز هاوس منصة موثوقة، وهل يُعتراف بالخدمات المقدَّمة؟",
    a: "نعمل وفق سياسات واضحة للطلبات والتقييم، ويمكنك متابعة حالة طلبك من لوحة التحكم. للاعتماد الرسمي يعتمد أصحاب العمل على سياساتهم؛ نوصي بالاحتفاظ بإثبات التسليم والمراسلات داخل المنصة.",
  },
  {
    id: "worth",
    q: "هل تستحق خدمات المنصة المدفوعة الاستثمار؟",
    a: "يعتمد ذلك على احتياجك: يمكنك مقارنة عروض المستقلين، مراجعة التقييمات، وتحديد نطاق العمل قبل الالتزام. ابدأ بطلب صغير لتقييم الجودة ثم وسّع النطاق عند الرضا.",
  },
  {
    id: "plus",
    q: "ما هي ميزات الباقات أو الخيارات المتقدمة، وهل تناسبني؟",
    a: "إن وُجدت باقات أو ميزات إضافية، ستجدها موضحة في صفحة التسعير أو الإعدادات. راجع ما يشمله كل مستوى واختر ما يطابق حجم فريقك أو عدد طلباتك.",
  },
  {
    id: "free",
    q: "هل تتوفر موارد أو إرشادات مجانية للمستخدمين؟",
    a: "نوفر محتوى مساعد وأسئلة شائعة وصفحات توضيحية على الموقع. تابع قسم المساعدة أو المدونة عند توفرها للتحديثات.",
  },
  {
    id: "popular",
    q: "ما هي أكثر أنواع الطلبات شعبية على المنصة؟",
    a: "يتغيّر ذلك مع الوقت؛ غالباً الطلبات ضمن البرمجة والتصميم وكتابة المحتوى الأكثر نشاطاً. تصفح التصنيفات لمعرفة العروض الحالية.",
  },
  {
    id: "career",
    q: "كيف تساعدني المنصة في إيجاد مستقل مناسب أو إتمام مشروعي؟",
    a: "تحدد التصنيف والتفاصيل والموعد المطلوب، ثم يطلع المستقلون المناسبون على طلبك. يمكنك مقارنة العروض والمحادثة الآمنة ضمن الطلب قبل الاختيار.",
  },
  {
    id: "business",
    q: "ما هي خدمات المنصة للفرق أو الأعمال، وكيف يتم التسعير؟",
    a: "إن كانت لديكم احتياجات متكررة أو حجم أكبر، راجعوا صفحة التواصل أو الخدمات للأعمال إن وُجدت، أو تواصلوا مع الدعم لعرض مناسب لفريقكم.",
  },
];

function Chevron({ open }) {
  return (
    <span
      className={`shrink-0 text-violet-600 transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const FaqSection = () => {
  const [openId, setOpenId] = useState(null);

  const toggle = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      className="relative w-full border-t border-slate-200/60 px-4 py-12 sm:px-6 sm:py-14 md:px-8 md:py-16 lg:px-10"
      aria-labelledby="home-faq-heading"
      dir="rtl"
    >
      <div className="mx-auto w-full max-w-6xl pb-2">
        <header className="mb-8 text-right sm:mb-10">
          <h2
            id="home-faq-heading"
            className="m-0 text-[clamp(1.45rem,3.2vw,1.9rem)] font-extrabold leading-tight tracking-tight text-[#1e293b]"
          >
            الأسئلة الشائعة
          </h2>
          <p className="mt-2.5 mb-0 max-w-xl text-[0.92rem] leading-relaxed text-slate-600 sm:text-[0.95rem]">
            إجابات سريعة وواضحة على أكثر الأسئلة شيوعًا.
          </p>
        </header>

        <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-start md:gap-8 lg:gap-12">
          <ul className="m-0 min-w-0 flex-1 list-none divide-y divide-slate-200/80 p-0" role="list">
            {FAQ_ITEMS.map((item) => {
              const open = openId === item.id;
              const panelId = `faq-panel-${item.id}`;
              const buttonId = `faq-trigger-${item.id}`;
              return (
                <li key={item.id}>
                  <button
                    id={buttonId}
                    type="button"
                    className={`flex w-full items-center gap-3 px-1 py-4 text-right transition-colors sm:gap-4 sm:px-0 sm:py-[1.15rem] ${
                      open ? "bg-violet-50/85 hover:bg-violet-50/90" : "bg-transparent hover:bg-slate-100/60"
                    }`}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggle(item.id)}
                  >
                    <span className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-relaxed text-[#1e293b] sm:text-base">
                      {item.q}
                    </span>
                    <Chevron open={open} />
                  </button>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!open}
                    className="border-t border-slate-200/70 bg-violet-50/40"
                  >
                    <p className="m-0 px-1 pb-5 pt-3.5 text-right text-[0.9rem] leading-[1.75] text-slate-600 sm:px-0 sm:text-[0.95rem]">
                      {item.a}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            className="flex shrink-0 items-start justify-center md:w-[min(42%,14rem)] md:justify-end lg:w-[min(38%,16rem)] lg:sticky lg:top-24"
            aria-hidden
          >
            <img
              src="/home-faq-side-accent.png"
              alt=""
              width={256}
              height={256}
              decoding="async"
              className="pointer-events-none h-[clamp(9rem,28vw,16rem)] w-[clamp(9rem,28vw,16rem)] max-w-full object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
