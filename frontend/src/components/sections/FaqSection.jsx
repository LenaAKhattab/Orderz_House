import { useState } from "react";

/** RTL accordion list — flat rows, bottom borders, chevron on the visual right (reference layout) */
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
      className={`shrink-0 text-gray-500 transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
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
      className="relative w-full px-4 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-16"
      aria-labelledby="home-faq-heading"
      dir="rtl"
    >
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 sm:mb-10">
          <h2
            id="home-faq-heading"
            className="m-0 text-right text-2xl font-bold tracking-tight text-gray-900 sm:text-[clamp(1.35rem,2.8vw,1.75rem)]"
          >
            الأسئلة الشائعة
          </h2>
        </header>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ul className="m-0 list-none divide-y divide-gray-200 p-0" role="list">
          {FAQ_ITEMS.map((item) => {
            const open = openId === item.id;
            const panelId = `faq-panel-${item.id}`;
            const buttonId = `faq-trigger-${item.id}`;
            return (
              <li key={item.id}>
                <button
                  id={buttonId}
                  type="button"
                  className={`flex w-full items-center gap-4 px-1 py-5 text-right transition-colors sm:px-2 sm:py-[1.35rem] ${
                    open ? "bg-gray-50" : "bg-white hover:bg-gray-50"
                  }`}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(item.id)}
                >
                  {/* في RTL: العنصر الأول يظهر يميناً — الشيفرون على أقصى اليمين */}
                  <Chevron open={open} />
                  <span className="min-w-0 flex-1 text-[0.95rem] font-normal leading-relaxed text-gray-900 sm:text-base">
                    {item.q}
                  </span>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!open}
                  className="border-t border-gray-100 bg-gray-50"
                >
                  <p className="px-1 pb-5 pt-3 text-right text-sm leading-[1.75] text-gray-600 sm:px-2 sm:text-[0.95rem]">
                    {item.a}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
