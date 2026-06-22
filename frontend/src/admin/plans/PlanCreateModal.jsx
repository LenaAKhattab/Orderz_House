import { useEffect } from "react";

import Button from "../../components/ui/Button";

import { useTranslation } from "../../i18n/LanguageProvider";

import PlanFormModalBody from "./PlanFormModalBody";



/**

 * @param {{

 *   open: boolean;

 *   submitting: boolean;

 *   form: Record<string, unknown>;

 *   setForm: import("react").Dispatch<import("react").SetStateAction<Record<string, unknown>>>;

 *   generatedInternalName: string;

 *   canCreate: boolean;

 *   onClose: () => void;

 *   onCreate: () => void | Promise<void>;

 *   onReset: () => void;
 *   planPages?: object[];
 *   canonicalPlans?: object[];
 * }} p
 */
export default function PlanCreateModal({
  open,
  submitting,
  form,
  setForm,
  generatedInternalName,
  canCreate,
  onClose,
  onCreate,
  onReset,
  planPages = [],
  canonicalPlans = [],
}) {

  const { dir, locale } = useTranslation();

  const isEn = locale === "en";

  const title = isEn ? "Create New Plan" : "إنشاء باقة جديدة";

  const closeLabel = isEn ? "Close" : "إغلاق";

  const backdropLabel = isEn ? "Close dialog" : "إغلاق النافذة";



  useEffect(() => {

    if (!open) return undefined;



    const prevOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";



    const onKeyDown = (event) => {

      if (event.key === "Escape" && !submitting) {

        onClose();

      }

    };



    document.addEventListener("keydown", onKeyDown);



    return () => {

      document.body.style.overflow = prevOverflow;

      document.removeEventListener("keydown", onKeyDown);

    };

  }, [open, submitting, onClose]);



  if (!open) return null;



  return (

    <div className="oh-sapl-modal-root" role="presentation">

      <button

        type="button"

        className="oh-sapl-modal-backdrop"

        onClick={() => {

          if (!submitting) onClose();

        }}

        aria-label={backdropLabel}

      />

      <div

        className="oh-sapl-modal oh-sapl-modal--wide"

        role="dialog"

        aria-modal="true"

        aria-labelledby="oh-sapl-create-title"

        dir={dir}

      >

        <header className="oh-sapl-modal__head">

          <div>

            <h2 id="oh-sapl-create-title" className="oh-sapl-modal__title">

              {title}

            </h2>

            <p className="oh-sapl-modal__subtitle">
              {isEn ? "New subscription plan template." : "قالب اشتراك جديد."}
            </p>

          </div>

          <button

            type="button"

            className="oh-sapl-modal__close"

            onClick={onClose}

            disabled={submitting}

            aria-label={closeLabel}

          >

            ×

          </button>

        </header>



        <div className="oh-sapl-modal__scroll">

          <PlanFormModalBody
            form={form}
            setForm={setForm}
            submitting={submitting}
            mode="create"
            planPages={planPages}
            canonicalPlans={canonicalPlans}
          />

        </div>



        <footer className="oh-sapl-modal__foot">

          <Button type="button" variant="secondary" disabled={submitting} onClick={onReset}>

            {isEn ? "Clear fields" : "مسح الحقول"}

          </Button>

          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>

            {isEn ? "Cancel" : "إلغاء"}

          </Button>

          <Button type="button" disabled={submitting || !canCreate} onClick={() => void onCreate()}>

            {isEn ? "Save and add plan" : "حفظ وإضافة الباقة"}

          </Button>

        </footer>

      </div>

    </div>

  );

}

