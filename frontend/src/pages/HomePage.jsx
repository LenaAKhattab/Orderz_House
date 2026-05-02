import { useEffect, useState } from "react";
import { getHealthStatus } from "../services/api";

const sectionCard =
  "rounded-xl border border-[rgba(47,59,101,0.2)] bg-white p-5 shadow-[0_1px_3px_rgba(47,59,101,0.06)] md:p-6";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[10px] border-0 bg-[#2f3b65] px-[18px] py-2.5 font-semibold text-white transition-colors duration-[250ms] hover:bg-[#76cfdf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76cfdf] active:bg-[#2f3b65]";
const btnSecondary =
  "inline-flex items-center justify-center rounded-[10px] border border-[rgba(47,59,101,0.2)] bg-transparent px-[18px] py-2.5 font-semibold text-[#2f3b65] transition-colors duration-[250ms] hover:border-[rgba(47,59,101,0.4)] hover:bg-[rgba(56,82,180,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76cfdf] active:bg-[rgba(56,82,180,0.12)]";

const HomePage = () => {
  const [healthData, setHealthData] = useState({
    message: "جاري التحقق من حالة الخادم...",
    timestamp: "",
    database: "غير معروف",
  });
  const [error, setError] = useState("");

  const roles = [
    {
      title: "مشرف عام",
      description: "يمتلك التوجيه العام للمنصة والحوكمة والصلاحيات العليا.",
    },
    {
      title: "مدير",
      description: "يدير التشغيل اليومي ويتولى إدخال الطلبات يدويًا في المرحلة الحالية.",
    },
    {
      title: "عميل",
      description: "يطلب الخدمات ويتابع نتائج التنفيذ والتسليم.",
    },
    {
      title: "مستقل",
      description: "ينفذ الطلبات المعتمدة ويقدم الأعمال المطلوبة.",
    },
  ];

  const workflow = [
    "يرسل العميل طلبه عبر واتساب.",
    "يقوم فريق المنصة/المدير بتحويل الطلب إلى أمر عمل منظم داخل النظام.",
    "يتم إسناد الطلب إلى مستقل مناسب لبدء التنفيذ.",
    "يتابع النظام تقدم العمل والحالات التشغيلية بشكل واضح.",
  ];

  const mapHealthMessage = (message) => {
    if (!message) return "الخدمة تعمل بشكل طبيعي";
    if (message.toLowerCase().includes("api is running")) {
      return "الخدمة تعمل بشكل طبيعي";
    }
    return message;
  };

  const mapDatabaseStatus = (status) => {
    if (status === "connected") return "متصل";
    if (status === "degraded") return "متدهور";
    if (status === "disconnected") return "غير متصل";
    return "غير معروف";
  };

  const formatArabicDateTime = (isoString) => {
    if (!isoString) return "جاري التحميل...";
    try {
      // Keep Arabic text, but force English digits in the formatted date/time
      return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  useEffect(() => {
    const fetchHealthStatus = async () => {
      try {
        const data = await getHealthStatus();
        setHealthData({
          message: mapHealthMessage(data.message),
          timestamp: data.timestamp || "",
          database: mapDatabaseStatus(data.database),
        });
      } catch {
        setError("تعذر الاتصال بخدمة الخلفية حاليًا.");
      }
    };

    fetchHealthStatus();
  }, []);

  return (
    <div className="home-page mx-auto flex w-full max-w-[min(1160px,calc(100%-48px))] flex-1 flex-col gap-6 py-6 md:gap-8 md:py-10">
      <section
        className={`relative ${sectionCard} bg-linear-to-bl from-[rgba(47,59,101,0.06)] via-white to-white`}
      >
        <p className="mb-2 text-sm font-extrabold tracking-wide text-[#76cfdf]">
          أوردرز هاوس
        </p>
        <h1 className="mb-2.5 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold leading-snug text-[#2f3b65]">
          منصة تشغيل بين العميل والمستقل، تُبنى خطوة بخطوة.
        </h1>
        <p className="mb-0 max-w-[68ch] leading-relaxed text-[#2f3b65]">
          تربط منصة أوردرز هاوس طلبات العملاء بتنفيذ المستقلين عبر مسار تشغيلي
          منظم، مع جاهزية للتوسع إلى سوق خدمات متكامل.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className={btnPrimary}>
            عرض آلية العمل الحالية
          </button>
          <button type="button" className={btnSecondary}>
            هيكل المنصة
          </button>
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-2.5 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold text-[#2f3b65]">
          نبذة عن المنصة
        </h2>
        <p className="mb-3 text-[#2f3b65] last:mb-0">
          أوردرز هاوس هو أساس منصة خدمات تربط بين العميل والمستقل وفريق إدارة
          المنصة.
        </p>
        <p className="mb-0 text-[#2f3b65]">
          في المرحلة التشغيلية الحالية، تصل طلبات العملاء يدويًا (خصوصًا عبر
          واتساب)، ثم يقوم فريق المنصة بإدخالها كطلبات منظمة داخل النظام.
        </p>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-4 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold text-[#2f3b65]">
          نظرة عامة على الأدوار
        </h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map((role) => (
            <article
              className="rounded-xl border border-[rgba(47,59,101,0.2)] bg-white p-4"
              key={role.title}
            >
              <h3 className="mb-2 text-lg font-bold text-[#2f3b65]">{role.title}</h3>
              <p className="mb-0 text-[#2f3b65]">{role.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-4 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold text-[#2f3b65]">
          آلية العمل الحالية
        </h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {workflow.map((step) => (
            <article
              className="rounded-xl border border-[rgba(47,59,101,0.2)] bg-[rgba(56,82,180,0.03)] p-4"
              key={step}
            >
              <p className="mb-0 text-[#2f3b65]">{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-2.5 text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold text-[#2f3b65]">
          أساس جاهز للتوسع
        </h2>
        <p className="mb-4 text-[#2f3b65]">
          يتم بناء المنصة بهيكل قابل للتوسع لدعم مراحل لاحقة تشمل تجارب حسب
          الدور، أتمتة تشغيلية أوسع، ومسارات استخدام مكتملة للعملاء.
        </p>
        <div className="rounded-xl border border-[rgba(47,59,101,0.2)] bg-[rgba(56,82,180,0.05)] p-4 text-[#2f3b65]">
          {error ? (
            <p className="mb-0 font-semibold text-[#b91c1c]">{error}</p>
          ) : (
            <>
              <p className="mb-3 last:mb-0">
                <strong>حالة الخدمة:</strong> {healthData.message}
              </p>
              <p className="mb-3 last:mb-0">
                <strong>قاعدة البيانات:</strong> {healthData.database}
              </p>
              <p className="mb-0">
                <strong>آخر فحص:</strong> {formatArabicDateTime(healthData.timestamp)}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
