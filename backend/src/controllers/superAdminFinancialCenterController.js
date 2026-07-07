const financialCenterService = require("../services/financialCenterService");
const {
  createLoginAccountForPerson,
  setPersonAccountActive,
} = require("../services/financialCenterAccountService");
const { listAuditLogsForEntity } = require("../services/financialCenterAuditService");
const financialDepartmentService = require("../services/financialDepartmentService");

async function listPeople(req, res, next) {
  try {
    const result = await financialCenterService.listPeople({
      q: req.query.q,
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({
      success: true,
      data: {
        people: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getPerson(req, res, next) {
  try {
    const person = await financialCenterService.getPersonById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: "الموظف غير موجود." });
    const auditLogs = await listAuditLogsForEntity({
      entityType: "financial_person",
      entityId: req.params.id,
    });
    return res.status(200).json({ success: true, data: { person, auditLogs } });
  } catch (err) {
    return next(err);
  }
}

async function createPerson(req, res, next) {
  try {
    const person = await financialCenterService.createPerson({
      actorUserId: req.auth.userId,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: { person } });
  } catch (err) {
    return next(err);
  }
}

async function updatePerson(req, res, next) {
  try {
    const person = await financialCenterService.updatePerson({
      actorUserId: req.auth.userId,
      id: req.params.id,
      payload: req.body,
    });
    return res.status(200).json({ success: true, data: { person } });
  } catch (err) {
    return next(err);
  }
}

async function deactivatePerson(req, res, next) {
  try {
    const person = await financialCenterService.deactivatePerson({
      actorUserId: req.auth.userId,
      id: req.params.id,
    });
    return res.status(200).json({ success: true, data: { person } });
  } catch (err) {
    return next(err);
  }
}

async function createPersonAccount(req, res, next) {
  try {
    const person = await financialCenterService.getPersonById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: "الموظف غير موجود." });
    const account = await createLoginAccountForPerson({
      actorUserId: req.auth.userId,
      personId: req.params.id,
      loginEmail: req.body.loginEmail,
      password: req.body.password,
      fullName: person.fullName,
    });
    const updated = await financialCenterService.getPersonById(req.params.id);
    return res.status(201).json({ success: true, data: { person: updated, account } });
  } catch (err) {
    return next(err);
  }
}

async function suspendPersonAccount(req, res, next) {
  try {
    const account = await setPersonAccountActive({
      actorUserId: req.auth.userId,
      personId: req.params.id,
      isActive: false,
    });
    const person = await financialCenterService.getPersonById(req.params.id);
    return res.status(200).json({ success: true, data: { person, account } });
  } catch (err) {
    return next(err);
  }
}

async function activatePersonAccount(req, res, next) {
  try {
    const account = await setPersonAccountActive({
      actorUserId: req.auth.userId,
      personId: req.params.id,
      isActive: true,
    });
    const person = await financialCenterService.getPersonById(req.params.id);
    return res.status(200).json({ success: true, data: { person, account } });
  } catch (err) {
    return next(err);
  }
}

async function getPersonBonusDetails(req, res, next) {
  try {
    const data = await financialCenterService.getPersonBonusDetails({
      personId: req.params.id,
      month: req.query.month,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function listBonusRows(req, res, next) {
  try {
    const result = await financialCenterService.listBonusRows({
      month: req.query.month,
      status: req.query.status,
      sourceType: req.query.sourceType,
      receivedStatus: req.query.receivedStatus,
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({
      success: true,
      data: {
        rows: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getBonusRow(req, res, next) {
  try {
    const row = await financialCenterService.getBonusRowById(req.params.id, { includeAudit: true });
    if (!row) return res.status(404).json({ success: false, message: "صف البونص غير موجود." });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function createBonusRow(req, res, next) {
  try {
    const row = await financialCenterService.createBonusRow({
      actorUserId: req.auth.userId,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function updateBonusRow(req, res, next) {
  try {
    const row = await financialCenterService.updateBonusRow({
      actorUserId: req.auth.userId,
      id: req.params.id,
      payload: req.body,
    });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function approveBonusRow(req, res, next) {
  try {
    const row = await financialCenterService.transitionBonusRow({
      actorUserId: req.auth.userId,
      id: req.params.id,
      action: "approve",
    });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function markBonusRowReceived(req, res, next) {
  try {
    const row = await financialCenterService.transitionBonusRow({
      actorUserId: req.auth.userId,
      id: req.params.id,
      action: "mark-received",
      payload: req.body,
    });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function markBonusRowPaid(req, res, next) {
  try {
    const row = await financialCenterService.transitionBonusRow({
      actorUserId: req.auth.userId,
      id: req.params.id,
      action: "mark-paid",
    });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function cancelBonusRow(req, res, next) {
  try {
    const row = await financialCenterService.transitionBonusRow({
      actorUserId: req.auth.userId,
      id: req.params.id,
      action: "cancel",
    });
    return res.status(200).json({ success: true, data: { row } });
  } catch (err) {
    return next(err);
  }
}

async function updateAllocation(req, res, next) {
  try {
    const allocation = await financialCenterService.updateAllocation({
      actorUserId: req.auth.userId,
      allocationId: req.params.allocationId,
      payload: req.body,
    });
    return res.status(200).json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function markAllocationPaid(req, res, next) {
  try {
    const allocation = await financialCenterService.updateAllocation({
      actorUserId: req.auth.userId,
      allocationId: req.params.allocationId,
      payload: { paidStatus: "paid", paidAt: req.body.paidAt, note: req.body.note },
    });
    return res.status(200).json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function markAllocationUnpaid(req, res, next) {
  try {
    const allocation = await financialCenterService.updateAllocation({
      actorUserId: req.auth.userId,
      allocationId: req.params.allocationId,
      payload: { paidStatus: "unpaid", paidAt: null, note: req.body.note },
    });
    return res.status(200).json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function markAllocationHeld(req, res, next) {
  try {
    const allocation = await financialCenterService.updateAllocation({
      actorUserId: req.auth.userId,
      allocationId: req.params.allocationId,
      payload: { paidStatus: "held", paidAt: null, note: req.body.note },
    });
    return res.status(200).json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function listSubscriptionSourcePayments(req, res, next) {
  try {
    const items = await financialCenterService.listSubscriptionSourcePayments({
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function listOrderSourcePayments(req, res, next) {
  try {
    const items = await financialCenterService.listOrderSourcePayments({
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const summary = await financialCenterService.getSummary({ month: req.query.month });
    return res.status(200).json({ success: true, data: { summary } });
  } catch (err) {
    return next(err);
  }
}

async function listDepartments(req, res, next) {
  try {
    const departments = await financialDepartmentService.listDepartments({
      status: req.query.status || "active",
    });
    return res.status(200).json({ success: true, data: { departments } });
  } catch (err) {
    return next(err);
  }
}

async function createDepartment(req, res, next) {
  try {
    const department = await financialDepartmentService.createDepartment({
      name: req.body.name,
      actorUserId: req.auth.userId,
    });
    return res.status(201).json({ success: true, data: { department } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPeople,
  getPerson,
  createPerson,
  updatePerson,
  deactivatePerson,
  createPersonAccount,
  suspendPersonAccount,
  activatePersonAccount,
  getPersonBonusDetails,
  listBonusRows,
  getBonusRow,
  createBonusRow,
  updateBonusRow,
  approveBonusRow,
  markBonusRowReceived,
  markBonusRowPaid,
  cancelBonusRow,
  updateAllocation,
  markAllocationPaid,
  markAllocationUnpaid,
  markAllocationHeld,
  listSubscriptionSourcePayments,
  listOrderSourcePayments,
  getSummary,
  listDepartments,
  createDepartment,
};
