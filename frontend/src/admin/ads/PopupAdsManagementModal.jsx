import { useRef, useState } from "react";
import DashboardModal from "../../components/dashboard/DashboardModal";
import PopupAdsSettings from "./PopupAdsSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function PopupAdsManagementModal({ open, onClose }) {
  const { t } = useTranslation();
  const actionHandlersRef = useRef({});
  const [actionMeta, setActionMeta] = useState({
    saving: false,
    deleting: false,
    editingId: null,
    canPreview: false,
    isCreating: false,
    detailOpen: false,
  });

  const showActions = actionMeta.detailOpen;

  return (
    <DashboardModal
      open={open}
      title={t("ads.popup.modalTitle")}
      ariaLabel={t("ads.popup.modalTitle")}
      onClose={onClose}
      className="oh-popup-ads-modal"
      footer={
        <div className="oh-popup-ads-modal__foot-actions">
          {showActions ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!actionMeta.canPreview}
                onClick={() => actionHandlersRef.current.onPreview?.()}
              >
                {t("ads.common.preview")}
              </button>
              {actionMeta.editingId ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionMeta.saving || actionMeta.deleting}
                  onClick={() => void actionHandlersRef.current.onDelete?.()}
                >
                  {actionMeta.deleting ? t("ads.common.deleting") : t("ads.common.delete")}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionMeta.saving || actionMeta.deleting}
                onClick={() => void actionHandlersRef.current.onSave?.()}
              >
                {actionMeta.saving ? t("ads.common.saving") : t("ads.common.save")}
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("ads.common.close")}
          </button>
        </div>
      }
    >
      <PopupAdsSettings
        open={open}
        actionsInFooter
        actionHandlersRef={actionHandlersRef}
        onActionMetaChange={setActionMeta}
      />
    </DashboardModal>
  );
}
