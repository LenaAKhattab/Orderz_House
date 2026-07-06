import { useRef, useState } from "react";
import DashboardModal from "../../components/dashboard/DashboardModal";
import PopupAdsSettings from "./PopupAdsSettings";

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function PopupAdsManagementModal({ open, onClose }) {
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
      title="إدارة الإعلانات المنبثقة"
      ariaLabel="إدارة الإعلانات المنبثقة"
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
                معاينة
              </button>
              {actionMeta.editingId ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionMeta.saving || actionMeta.deleting}
                  onClick={() => void actionHandlersRef.current.onDelete?.()}
                >
                  {actionMeta.deleting ? "جارٍ الحذف…" : "حذف"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionMeta.saving || actionMeta.deleting}
                onClick={() => void actionHandlersRef.current.onSave?.()}
              >
                {actionMeta.saving ? "جارٍ الحفظ…" : "حفظ"}
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            إغلاق
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
