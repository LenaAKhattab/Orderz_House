import { getFreelancerDashboardSummaryRequest } from "../services/api";
import { deriveFreelancerCoursesFocus } from "./freelancerDashboardData";

let cachedFocus = null;
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    listener(cachedFocus);
  }
}

export function setFreelancerCoursesFocusFromSummary(summary) {
  cachedFocus = deriveFreelancerCoursesFocus(summary);
  notify();
  return cachedFocus;
}

export function getFreelancerCoursesFocusCached() {
  return cachedFocus;
}

export function subscribeFreelancerCoursesFocus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function ensureFreelancerCoursesFocus() {
  if (cachedFocus) return cachedFocus;
  const res = await getFreelancerDashboardSummaryRequest();
  const summary = res?.data ?? res;
  return setFreelancerCoursesFocusFromSummary(summary);
}
