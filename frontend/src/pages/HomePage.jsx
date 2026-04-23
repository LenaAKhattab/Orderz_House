import { useEffect, useState } from "react";
import { getHealthStatus } from "../services/api";

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
    <div className="home-page">
      <section className="hero section-card">
        <p className="eyebrow">أوردرز هاوس</p>
        <h1>منصة تشغيل بين العميل والمستقل، تُبنى خطوة بخطوة.</h1>
        <p className="lead">
          تربط منصة أوردرز هاوس طلبات العملاء بتنفيذ المستقلين عبر مسار تشغيلي
          منظم، مع جاهزية للتوسع إلى سوق خدمات متكامل.
        </p>
        <div className="hero-cta">
          <button type="button" className="btn btn-primary">
            عرض آلية العمل الحالية
          </button>
          <button type="button" className="btn btn-secondary">
            هيكل المنصة
          </button>
        </div>
      </section>

      <section className="section-card">
        <h2>نبذة عن المنصة</h2>
        <p>
          أوردرز هاوس هو أساس منصة خدمات تربط بين العميل والمستقل وفريق إدارة
          المنصة.
        </p>
        <p>
          في المرحلة التشغيلية الحالية، تصل طلبات العملاء يدويًا (خصوصًا عبر
          واتساب)، ثم يقوم فريق المنصة بإدخالها كطلبات منظمة داخل النظام.
        </p>
      </section>

      <section className="section-card">
        <h2>نظرة عامة على الأدوار</h2>
        <div className="grid">
          {roles.map((role) => (
            <article className="info-card" key={role.title}>
              <h3>{role.title}</h3>
              <p>{role.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2>آلية العمل الحالية</h2>
        <div className="grid">
          {workflow.map((step) => (
            <article className="info-card workflow-card" key={step}>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2>أساس جاهز للتوسع</h2>
        <p>
          يتم بناء المنصة بهيكل قابل للتوسع لدعم مراحل لاحقة تشمل تجارب حسب
          الدور، أتمتة تشغيلية أوسع، ومسارات استخدام مكتملة للعملاء.
        </p>
        <div className="status-box">
          {error ? (
            <p className="status-error">{error}</p>
          ) : (
            <>
              <p>
                <strong>حالة الخدمة:</strong> {healthData.message}
              </p>
              <p>
                <strong>قاعدة البيانات:</strong> {healthData.database}
              </p>
              <p>
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
