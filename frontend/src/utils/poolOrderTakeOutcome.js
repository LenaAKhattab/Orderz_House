/** True when pool take resulted in a real assignment (not marketplace-only registration). */
export function isPoolOrderTakenAsAssignment(order) {
  if (!order || typeof order !== "object") return false;
  if (order.hasAssignedFreelancer === true) return true;
  if (order.receivedAt) return true;
  return false;
}
