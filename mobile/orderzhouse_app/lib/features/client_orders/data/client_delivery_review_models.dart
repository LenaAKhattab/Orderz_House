import 'client_order_models.dart';
import '../../../core/i18n/i18n.dart';

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
      return tr('تم إرسال التسليم وينتظر مراجعتك.');
    case 'completed':
      return tr('تم إكمال الطلب بنجاح.');
    case 'revision_required':
      return tr('تم طلب تعديلات من المستقل.');
    case 'in_progress':
    case 'assigned':
    case 'ready_for_work':
      if (order.clientRevisionNote != null && order.clientRevisionNote!.trim().isNotEmpty) {
        return tr('تم طلب تعديلات من المستقل.');
      }
      return tr('بانتظار تسليم المستقل.');
    case 'cancelled':
      return tr('الطلب ملغي.');
    default:
      return tr('لا توجد مراجعة تسليم متاحة حالياً.');
  }
}

class RequestDeliveryRevisionPayload {
  const RequestDeliveryRevisionPayload({required this.note});

  final String note;

  Map<String, dynamic> toJson() => {'note': note.trim()};
}

String? validateDeliveryRevisionNote(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return tr('ملاحظات التعديل مطلوبة.');
  if (trimmed.length < minDeliveryRevisionNoteLength) {
    return tr('اكتب ملاحظة أوضح (10 أحرف على الأقل).');
  }
  return null;
}
