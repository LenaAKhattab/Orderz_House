/**
 * Pure helpers for Priority Bid remaining + in-memory accounting simulator (tests).
 * Phase 3.1: uniqueness is per (cycleId, referenceType, referenceId, eventType).
 */

function priorityBidRemaining(allowed, consumed) {
  const a = Math.max(0, Number(allowed) || 0);
  const c = Math.max(0, Number(consumed) || 0);
  return Math.max(a - c, 0);
}

function createInMemoryPriorityBidUsageStore({ allowed, cycleId = "cycle-1" }) {
  let consumed = 0;
  const events = new Map();
  const returnsByConsume = new Set();

  function key(eventType, referenceType, referenceId) {
    return `${cycleId}|${eventType}|${referenceType}|${referenceId}`;
  }

  function snapshot() {
    return {
      cycleId,
      allowed,
      used: consumed,
      remaining: priorityBidRemaining(allowed, consumed),
    };
  }

  function consume({ referenceType, referenceId }) {
    const k = key("consumed", referenceType, referenceId);
    if (events.has(k)) {
      return { ok: true, idempotent: true, ...snapshot() };
    }
    if (priorityBidRemaining(allowed, consumed) <= 0) {
      return { ok: false, code: "PRIORITY_BID_USES_EXHAUSTED", ...snapshot() };
    }
    consumed += 1;
    const usageId = `u-${events.size + 1}`;
    events.set(k, { eventType: "consumed", delta: 1, usageId });
    return { ok: true, idempotent: false, usageId, ...snapshot() };
  }

  function returnUse({ referenceType, referenceId }) {
    const ck = key("consumed", referenceType, referenceId);
    const consumedEvent = events.get(ck);
    if (!consumedEvent) {
      return { ok: false, code: "PRIORITY_USE_NOT_FOUND", ...snapshot() };
    }
    const rk = key("returned", referenceType, referenceId);
    if (events.has(rk) || returnsByConsume.has(consumedEvent.usageId)) {
      return { ok: true, idempotent: true, ...snapshot() };
    }
    if (consumed <= 0) {
      return { ok: false, code: "PRIORITY_USE_RETURN_INVALID", ...snapshot() };
    }
    consumed -= 1;
    events.set(rk, {
      eventType: "returned",
      delta: -1,
      relatedUsageId: consumedEvent.usageId,
    });
    returnsByConsume.add(consumedEvent.usageId);
    return { ok: true, idempotent: false, ...snapshot() };
  }

  function raceConsumeLastSlots(attempts) {
    const results = attempts.map((a) => consume(a));
    return {
      successCount: results.filter((r) => r.ok && !r.idempotent).length,
      results,
      ...snapshot(),
    };
  }

  return { consume, returnUse, snapshot, raceConsumeLastSlots, events, cycleId };
}

/**
 * In-memory membership currentness / concurrent activation simulator.
 */
function createInMemoryMembershipRegistry() {
  const byFreelancer = new Map(); // freelancerId -> memberships[]
  let seq = 1;

  function activate({ freelancerId, planId }) {
    const list = byFreelancer.get(freelancerId) || [];
    for (const m of list) {
      if (m.isCurrent) {
        m.isCurrent = false;
        m.status = "superseded";
      }
    }
    if (list.some((m) => m.isCurrent)) {
      return { ok: false, code: "MARKETPLACE_MEMBERSHIP_CONFLICT" };
    }
    const membership = {
      id: String(seq++),
      freelancerId,
      planId,
      isCurrent: true,
      status: "active",
      cycleNumber: 1,
    };
    list.push(membership);
    byFreelancer.set(freelancerId, list);
    return { ok: true, membership };
  }

  function raceActivate(freelancerId, planIds) {
    const results = planIds.map((planId) => activate({ freelancerId, planId }));
    const currents = (byFreelancer.get(freelancerId) || []).filter((m) => m.isCurrent);
    return { results, currentCount: currents.length, currents };
  }

  return { activate, raceActivate, byFreelancer };
}

module.exports = {
  priorityBidRemaining,
  createInMemoryPriorityBidUsageStore,
  createInMemoryMembershipRegistry,
};
