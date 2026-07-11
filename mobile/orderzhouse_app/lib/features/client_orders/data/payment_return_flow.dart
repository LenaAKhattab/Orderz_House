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
