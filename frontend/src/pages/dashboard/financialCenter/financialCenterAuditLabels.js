const ACTION_MAP = {
  create_login_account: "createLoginAccount",
  suspend_login_account: "suspendLoginAccount",
  activate_login_account: "activateLoginAccount",
  update_bonus_row: "updateBonusRow",
  mark_received: "markReceived",
  mark_allocation_paid: "markAllocationPaid",
  mark_allocation_unpaid: "markAllocationUnpaid",
  mark_allocation_held: "markAllocationHeld",
  update_allocation: "updateAllocation",
  mark_paid: "markAllocationPaid",
  mark_unpaid: "markAllocationUnpaid",
};

const ENTITY_CREATE = {
  financial_person: "createEmployee",
  financial_bonus_row: "createBonusRow",
};

const ENTITY_UPDATE = {
  financial_person: "updateEmployee",
  financial_bonus_row: "updateBonusRow",
};

export function getAuditActionLabel(action, entityType, t) {
  const ns = "dashboard.financialCenter.audit";
  const mapped = ACTION_MAP[action];
  if (mapped) return t(`${ns}.${mapped}`);

  if (action === "create" && entityType && ENTITY_CREATE[entityType]) {
    return t(`${ns}.${ENTITY_CREATE[entityType]}`);
  }
  if (action === "update" && entityType && ENTITY_UPDATE[entityType]) {
    return t(`${ns}.${ENTITY_UPDATE[entityType]}`);
  }
  if (action === "deactivate") return t(`${ns}.deactivateEmployee`);
  if (action === "approve") return t(`${ns}.approveBonusRow`);
  if (action === "cancel") return t(`${ns}.cancelBonusRow`);

  return action;
}

export function allocationPaidBadge(status, t) {
  if (status === "paid") return { tone: "success", label: t("dashboard.financialCenter.paid") };
  if (status === "held") return { tone: "pending", label: t("dashboard.financialCenter.held") };
  return { tone: "pending", label: t("dashboard.financialCenter.unpaid") };
}
