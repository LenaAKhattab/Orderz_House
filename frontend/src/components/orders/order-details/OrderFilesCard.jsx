import FileList from "./FileList";
import OrderDetailsNeuIcon from "./OrderDetailsNeuIcon";

/**
 * @param {object} props
 * @param {string} [props.title]
 * @param {Array} props.files
 * @param {string} props.emptyText
 * @param {string|null} [props.orderId]
 * @param {"client"|"freelancer"|"admin"|null} [props.fileAccess]
 */
export default function OrderFilesCard({
  title = "الملفات",
  files = [],
  emptyText = "لا توجد ملفات",
  orderId = null,
  fileAccess = null,
}) {
  return (
    <section className="od-files-card">
      <div className="od-section-head od-section-head--compact">
        <OrderDetailsNeuIcon name="files" variant="squircle" />
        <h3 className="od-files-card__title">{title}</h3>
      </div>
      <div className="od-files-card__body">
        <FileList files={files} emptyText={emptyText} orderId={orderId} fileAccess={fileAccess} />
      </div>
    </section>
  );
}
