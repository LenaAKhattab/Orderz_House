/** Pool / client order payloads may use `hasAssignedFreelancer` instead of raw `assignedFreelancerId`. */
export function orderHasAssignment(order) {
  return Boolean(order?.assignedFreelancerId || order?.hasAssignedFreelancer);
}
