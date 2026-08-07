import 'package:dio/dio.dart';

import '../../client_orders/data/order_attachment_limits.dart';
import '../../client_orders/data/order_attachment_models.dart';
import 'freelancer_my_order_models.dart';

/// Matches web `DELIVERY_UPLOAD_ALLOWED_STATUSES` and backend `FREELANCER_DELIVERY_ALLOWED_STATUSES`.
const freelancerDeliveryAllowedStatuses = <String>{
  'in_progress',
  'assigned',
  'ready_for_work',
};

bool freelancerCanDeliverOrder(FreelancerMyOrder order) {
  final status = order.orderStatus?.trim();
  if (status == null || status.isEmpty) return false;
  return freelancerDeliveryAllowedStatuses.contains(status);
}

String? freelancerDeliveryBlockedMessageAr(FreelancerMyOrder order) {
  if (freelancerCanDeliverOrder(order)) {
    final note = order.clientRevisionNote?.trim();
    if (note != null && note.isNotEmpty) {
      return 'العميل طلب تعديلات، يمكنك إرسال تسليم جديد.';
    }
    return null;
  }

  switch (order.orderStatus) {
    case 'pending_client_review':
      return 'تم إرسال التسليم وينتظر مراجعة العميل.';
    case 'completed':
      return 'تم إكمال الطلب.';
    case 'cancelled':
      return 'الطلب ملغي.';
    case 'revision_required':
      return 'العميل طلب تعديلات، يمكنك إرسال تسليم جديد.';
    default:
      return 'لا يمكن التسليم في الحالة الحالية للطلب.';
  }
}

Future<FormData> buildFreelancerDeliveryFormData(List<SelectedOrderAttachment> attachments) async {
  final formData = FormData();
  for (final file in attachments) {
    formData.files.add(
      MapEntry(orderAttachmentFormFieldName, await file.toMultipartFile()),
    );
  }
  return formData;
}

List<String> freelancerDeliveryFormFieldNames(List<SelectedOrderAttachment> attachments) {
  if (attachments.isEmpty) return const [];
  return List.filled(attachments.length, orderAttachmentFormFieldName);
}
