import { CheckCircle2, Info } from "lucide-react";

const BULLETS = [
  "كتابة الاسم الثلاثي كما هو معتمد في الطلب السابق.",
  "إدخال الرقم الوطني وتاريخ الميلاد ورقم الهاتف بشكل صحيح.",
  "كتابة المعلومات الدراسية أو المهنية كما هي دون اختصار أو تعديل غير دقيق.",
  "التأكد من صحة البريد الإلكتروني ورقم الهاتف لأنهما سيكونان وسيلة الدخول والتواصل.",
  "أي اختلاف أو خطأ في البيانات قد يؤدي إلى تعليق الطلب لحين المراجعة والتحقق.",
];

function Emph({ children }) {
  return <strong className="oh-legacy-instructions__emph">{children}</strong>;
}

function IntroText() {
  return (
    <>
      يرجى تعبئة البيانات المطلوبة <Emph>بدقة كاملة</Emph> وبما يتوافق مع المعلومات التي تم تقديمها سابقًا في{" "}
      <Emph>طلب/عقد الانضمام الأول</Emph>.
    </>
  );
}

function BulletList() {
  return (
    <ul className="oh-legacy-instructions__list">
      {BULLETS.map((text, index) => {
        const isLast = index === BULLETS.length - 1;
        return (
          <li key={text} className="oh-legacy-instructions__item">
            <CheckCircle2
              className="oh-legacy-instructions__icon"
              aria-hidden="true"
              strokeWidth={2}
            />
            <span>
              {isLast ? (
                <>
                  أي اختلاف أو خطأ في البيانات قد يؤدي إلى{" "}
                  <Emph>تعليق الطلب لحين المراجعة والتحقق</Emph>.
                </>
              ) : (
                text
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Static Arabic instructions for Legacy Freelancer invite registration only.
 * @param {{ variant?: "visual" | "form" }} props
 */
export default function LegacyRegistrationInstructions({ variant = "visual" }) {
  const isVisual = variant === "visual";

  const body = (
    <>
      <header className="oh-legacy-instructions__header">
        <h2 className="oh-legacy-instructions__title">إرشادات تعبئة الطلب</h2>
        <p className="oh-legacy-instructions__intro">
          <IntroText />
        </p>
      </header>

      <section className="oh-legacy-instructions__section" aria-labelledby={`legacy-guidelines-${variant}`}>
        <h3 id={`legacy-guidelines-${variant}`} className="oh-legacy-instructions__section-title">
          يرجى مراعاة ما يلي:
        </h3>
        <BulletList />
      </section>

      <section
        className="oh-legacy-instructions__declaration"
        aria-labelledby={`legacy-declaration-${variant}`}
      >
        <div className="oh-legacy-instructions__declaration-head">
          <Info className="oh-legacy-instructions__declaration-icon" aria-hidden="true" strokeWidth={2} />
          <h3 id={`legacy-declaration-${variant}`} className="oh-legacy-instructions__declaration-title">
            إقرار مهم
          </h3>
        </div>
        <p className="oh-legacy-instructions__declaration-text">
          من خلال تعبئة هذا النموذج، فإنك تؤكد أن البيانات المدخلة صحيحة وكاملة، وتتحمل مسؤولية صحتها.
        </p>
      </section>
    </>
  );

  if (isVisual) {
    return (
      <div className="oh-legacy-instructions oh-legacy-instructions--visual" dir="rtl">
        {body}
      </div>
    );
  }

  return (
    <details className="oh-legacy-instructions oh-legacy-instructions--form" dir="rtl" open>
      <summary className="oh-legacy-instructions__summary">
        <span>إرشادات تعبئة الطلب</span>
      </summary>
      <div className="oh-legacy-instructions__form-body">{body}</div>
    </details>
  );
}
