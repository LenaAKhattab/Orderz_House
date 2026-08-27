import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAuthApiErrorMessage,
  getOrderCreateErrorMessage,
  getRetryAfterSeconds,
  getSafeApiErrorMessage,
  isAxiosCanceledError,
  isAxiosNetworkError,
  isAxiosTimeoutError,
  isRateLimitedError,
} from "./apiErrorMessage.js";

describe("apiErrorMessage rate limit helpers", () => {
  it("detects 429 and RATE_LIMITED code", () => {
    assert.equal(isRateLimitedError({ response: { status: 429 } }), true);
    assert.equal(isRateLimitedError({ response: { status: 400, data: { code: "RATE_LIMITED" } } }), true);
    assert.equal(isRateLimitedError({ response: { status: 500 } }), false);
  });

  it("reads Retry-After header", () => {
    assert.equal(
      getRetryAfterSeconds({ response: { headers: { "retry-after": "12" } } }),
      12,
    );
  });

  it("maps order create 429 to clear Arabic message without suggesting auto-retry", () => {
    const msg = getOrderCreateErrorMessage({
      response: {
        status: 429,
        headers: { "retry-after": "8" },
        data: {
          code: "RATE_LIMITED",
          message: "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم حاول مرة أخرى.",
        },
      },
    });
    assert.match(msg, /تم إرسال عدد كبير من الطلبات/);
    assert.match(msg, /8/);
    assert.equal(/retry/i.test(msg), false);
  });

  it("maps 409 PRICING_CHANGED to a clear create-order message", () => {
    const msg = getOrderCreateErrorMessage({
      response: {
        status: 409,
        data: { code: "PRICING_CHANGED", message: "تغير السعر. راجع المبلغ." },
      },
    });
    assert.match(msg, /تغير السعر/);
  });
});

describe("apiErrorMessage cancel vs timeout", () => {
  it("detects canceled requests separately from timeouts", () => {
    assert.equal(isAxiosCanceledError({ code: "ERR_CANCELED", name: "CanceledError" }), true);
    assert.equal(isAxiosCanceledError({ name: "AbortError", message: "aborted" }), true);
    assert.equal(isAxiosCanceledError({ code: "ECONNABORTED", message: "timeout of 10000ms exceeded" }), false);
    assert.equal(isAxiosTimeoutError({ code: "ECONNABORTED", message: "timeout of 10000ms exceeded" }), true);
    assert.equal(isAxiosTimeoutError({ code: "ERR_CANCELED", name: "CanceledError" }), false);
  });
});

describe("apiErrorMessage network vs HTTP responses", () => {
  it("treats ERR_NETWORK / Network Error without response as network", () => {
    assert.equal(isAxiosNetworkError({ code: "ERR_NETWORK", message: "Network Error" }), true);
    assert.equal(isAxiosNetworkError({ message: "Network Error" }), true);
  });

  it("never classifies HTTP responses as network failures", () => {
    assert.equal(
      isAxiosNetworkError({
        message: "Network Error",
        response: { status: 500, data: { message: "حدث خطأ" } },
      }),
      false,
    );
    assert.equal(
      isAxiosNetworkError({
        message: "Request failed with status code 403",
        response: { status: 403, data: { code: "FORBIDDEN_ORIGIN", message: "طلب غير مصرح من هذا المصدر." } },
      }),
      false,
    );
  });

  it("preserves real HTTP API messages for registration-style errors", () => {
    const t = (key) =>
      ({
        "auth.register.error": "تعذر إنشاء الحساب. راجع الحقول وحاول مجدداً.",
        "auth.login.error": "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.",
        "auth.errors.network": "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.",
        "auth.errors.requestTimeout": "استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.",
        "auth.errors.loginTimeout": "استغرق تسجيل الدخول وقتًا أطول من المتوقع. حاول مرة أخرى بعد قليل.",
        "auth.errors.otpEmailFailed": "تعذر إرسال رسالة رمز التحقق.",
      })[key] || key;

    const httpMsg = getAuthApiErrorMessage(
      {
        message: "Request failed with status code 400",
        response: { status: 400, data: { message: "البريد الإلكتروني غير صالح" } },
      },
      t,
      "auth.register.error",
    );
    assert.equal(httpMsg, "البريد الإلكتروني غير صالح");

    const networkMsg = getAuthApiErrorMessage(
      { code: "ERR_NETWORK", message: "Network Error" },
      t,
      "auth.register.error",
    );
    assert.match(networkMsg, /تعذر الاتصال بالخادم/);
  });

  it("maps login timeout to login-specific Arabic message without Axios text", () => {
    const t = (key) =>
      ({
        "auth.login.error": "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.",
        "auth.errors.requestTimeout": "استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.",
        "auth.errors.loginTimeout": "استغرق تسجيل الدخول وقتًا أطول من المتوقع. حاول مرة أخرى بعد قليل.",
      })[key] || key;

    const msg = getAuthApiErrorMessage(
      { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" },
      t,
      "auth.login.error",
    );
    assert.equal(msg, "استغرق تسجيل الدخول وقتًا أطول من المتوقع. حاول مرة أخرى بعد قليل.");
    assert.doesNotMatch(msg, /timeout of|ECONNABORTED|10000ms/i);

    const registerTimeout = getAuthApiErrorMessage(
      { code: "ECONNABORTED", message: "timeout of 25000ms exceeded" },
      t,
      "auth.register.error",
    );
    assert.equal(registerTimeout, "استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.");
  });

  it("maps invalid credentials HTTP message for login unchanged", () => {
    const t = (key) =>
      ({
        "auth.login.error": "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.",
      })[key] || key;
    const msg = getAuthApiErrorMessage(
      {
        response: {
          status: 401,
          data: { code: "INVALID_CREDENTIALS", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
        },
      },
      t,
      "auth.login.error",
    );
    assert.equal(msg, "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  });

  it("does not surface English gateway text from HTML/proxy bodies", () => {
    const safe = getSafeApiErrorMessage({
      response: { status: 502, data: { message: "Bad Gateway" } },
    });
    assert.equal(safe, "حدث خطأ غير متوقع، حاول لاحقاً");
  });
});
