import { useState } from "react";
import { Link } from "react-router-dom";
import { HOME_FAQ_ITEMS } from "../../../constants/homeFaqItems";

function Chevron({ open }) {
  return (
    <svg
      className={`hm-faq__chevron${open ? " hm-faq__chevron--open" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mobile-only FAQ — quote card + menu-style accordion list. */
export default function HomeMobileFaq() {
  const [openId, setOpenId] = useState(null);

  const toggle = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="hm-faq" dir="rtl" aria-labelledby="hm-faq-heading">
      <header className="hm-section-head">
        <h2 id="hm-faq-heading" className="hm-section-head__title">
          الأسئلة الشائعة
        </h2>
      </header>

      <div className="hm-faq__quote">
        <p className="hm-faq__quote-label">لماذا أوردرز هاوس؟</p>
        <p className="hm-faq__quote-text">
          منصة واحدة لطلب الخدمات، مقارنة العروض، ومتابعة مشروعك حتى التسليم — بكل وضوح.
        </p>
        <Link to="/register" className="hm-faq__quote-cta">
          ابدأ الآن
        </Link>
      </div>

      <div className="hm-faq__menu">
        <ul className="hm-faq__list" role="list">
          {HOME_FAQ_ITEMS.map((item) => {
            const open = openId === item.id;
            const panelId = `hm-faq-panel-${item.id}`;
            const buttonId = `hm-faq-trigger-${item.id}`;
            return (
              <li key={item.id} className="hm-faq__item">
                <button
                  id={buttonId}
                  type="button"
                  className="hm-faq__trigger"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(item.id)}
                >
                  <span className="hm-faq__question">{item.q}</span>
                  <Chevron open={open} />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!open}
                  className="hm-faq__panel"
                >
                  <p className="hm-faq__answer">{item.a}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
