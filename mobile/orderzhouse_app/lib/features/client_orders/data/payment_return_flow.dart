enum PaymentReturnUiState {
  confirming,
  paid,
  pending,
  cancel,
  error,
  guestNeedsLogin,
}

const paymentReturnGuestMessageAr =
    'تم الرجوع من صفحة الدفع. لتأكيد حالة الطلب، سجّل الدخول بنفس الحساب.';

const paymentReturnPendingMessageAr =
    'تم استلام عملية الدفع، وقد يستغرق تأكيدها لحظات. يمكنك تحديث الحالة.';

const paymentReturnCancelTitleAr = 'لم يتم إكمال الدفع';

const paymentReturnCancelBodyAr =
    'أُلغيت عملية الدفع أو رجعت قبل إتمامها. يمكنك المحاولة مرة أخرى من تفاصيل الطلب.';

const paymentCheckoutOpenedNoteAr =
    'تم فتح صفحة الدفع. بعد إتمام الدفع ستُعاد إلى التطبيق لتأكيد الحالة. إذا رجعت دون إكمال الدفع، يمكنك المحاولة لاحقًا.';

/// How long to poll pay-confirm after a success deep link (webhook lag).
const paymentConfirmPollAttempts = 12;
const paymentConfirmPollInterval = Duration(seconds: 2);

/// Initial UI state when opening payment return.
PaymentReturnUiState initialPaymentReturnUiState({
  required bool isAuthenticated,
  required bool isCancel,
}) {
  if (isCancel) return PaymentReturnUiState.cancel;
  if (!isAuthenticated) return PaymentReturnUiState.guestNeedsLogin;
  return PaymentReturnUiState.confirming;
}

/// Whether the app should call backend confirm + fetch order.
bool shouldAttemptPaymentConfirmOnReturn({
  required bool isAuthenticated,
  required bool isCancel,
}) {
  return isAuthenticated && !isCancel;
}

/// Paid UI only when backend reports paid — never from deep link alone.
bool isOrderPaidFromBackend(String? paymentStatus) => paymentStatus == 'paid';

/// After polling exhausted without paid: soft pending, never hard failure.
PaymentReturnUiState paymentReturnStateAfterConfirmAttempts({
  required String? paymentStatus,
}) {
  if (isOrderPaidFromBackend(paymentStatus)) return PaymentReturnUiState.paid;
  return PaymentReturnUiState.pending;
}
