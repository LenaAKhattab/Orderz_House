import 'client_order_models.dart';

const int minDeliveryRevisionNoteLength = 10;

/// Matches backend + web: approve only when delivery is pending client review.
bool clientCanApproveDelivery(ClientOrder order) {
  if (order.orderStatus != 'pending_client_review') return false;
  final submission = clientCurrentDeliverySubmission(order);
  return submission != null && submission.filesCount > 0;
}

/// Matches backend allowed statuses for client revision request.
bool clientCanRequestRevision(ClientOrder order) {
  final status = order.orderStatus;
  if (status == null) return false;
  final allowedStatus = status == 'pending_client_review' ||
      status == 'in_progress' ||
      status == 'ready_for_work';
  if (!allowedStatus) return false;
  return clientCurrentDeliverySubmission(order) != null;
}

bool clientShowsDeliveryReviewSection(ClientOrder order) {
  if (order.needsPayment) return false;
  final status = order.orderStatus;
  if (status == null) return false;
  return status == 'pending_client_review' ||
      status == 'completed' ||
      status == 'revision_required' ||
      status == 'in_progress' ||
      status == 'assigned' ||
      status == 'ready_for_work' ||
      order.submissions.isNotEmpty;
}

ClientOrderSubmissionSummary? clientCurrentDeliverySubmission(ClientOrder order) {
  if (order.submissions.isEmpty) return null;
  return order.submissions.first;
}

String clientDeliveryReviewHeadlineAr(ClientOrder order) {
  switch (order.orderStatus) {
    case 'pending_client_review':
      return 'تم إرسال التسليم وينتظر مراجعتك.';
    case 'completed':
      return 'تم إكمال الطلب بنجاح.';
    case 'revision_required':
      return 'تم طلب تعديلات من المستقل.';
    case 'in_progress':
    case 'assigned':
    case 'ready_for_work':
      if (order.clientRevisionNote != null && order.clientRevisionNote!.trim().isNotEmpty) {
        return 'تم طلب تعديلات من المستقل.';
      }
      return 'بانتظار تسليم المستقل.';
    case 'cancelled':
      return 'الطلب ملغي.';
    default:
      return 'لا توجد مراجعة تسليم متاحة حالياً.';
  }
}

class RequestDeliveryRevisionPayload {
  const RequestDeliveryRevisionPayload({required this.note});

  final String note;

  Map<String, dynamic> toJson() => {'note': note.trim()};
}

String? validateDeliveryRevisionNote(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return 'ملاحظات التعديل مطلوبة.';
  if (trimmed.length < minDeliveryRevisionNoteLength) {
    return 'اكتب ملاحظة أوضح (10 أحرف على الأقل).';
  }
  return null;
}
