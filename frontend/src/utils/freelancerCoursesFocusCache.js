import { getFreelancerCoursesFocusRequest } from "../services/api";
import { deriveFreelancerCoursesFocus } from "./freelancerDashboardData";

let cachedFocus = null;
const listeners = new Set();
let focusPromise = null;

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
  if (focusPromise) return focusPromise;
  focusPromise = getFreelancerCoursesFocusRequest()
    .then((res) => {
      const payload = res?.data ?? res;
      const summary = {
        subscription: payload?.subscription ?? null,
        courses: payload?.courses ?? null,
      };
      focusPromise = null;
      return setFreelancerCoursesFocusFromSummary(summary);
    })
    .catch(() => {
      focusPromise = null;
      return cachedFocus;
    });
  return focusPromise;
}
