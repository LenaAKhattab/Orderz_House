/**
 * @deprecated Use PlanFormModalBody with mode="create" | "edit".
 */
import PlanFormModalBody from "./PlanFormModalBody";

export default function PlanExtendedFields({ form, setForm, submitting = false }) {
  return (
    <PlanFormModalBody form={form} setForm={setForm} submitting={submitting} mode="create" />
  );
}
