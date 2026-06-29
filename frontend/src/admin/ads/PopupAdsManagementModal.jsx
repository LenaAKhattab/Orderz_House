import DashboardModal from "../../components/dashboard/DashboardModal";
import PopupAdsSettings from "./PopupAdsSettings";

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function PopupAdsManagementModal({ open, onClose }) {
  return (
    <DashboardModal
      open={open}
      title="إدارة الإعلانات المنبثقة"
      ariaLabel="إدارة الإعلانات المنبثقة"
      onClose={onClose}
      className="oh-popup-ads-modal"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          إغلاق
        </button>
      }
    >
      <PopupAdsSettings open={open} />
    </DashboardModal>
  );
}
