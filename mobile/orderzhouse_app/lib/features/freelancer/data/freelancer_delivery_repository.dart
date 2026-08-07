import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../../client_orders/data/order_attachment_models.dart';
import 'freelancer_delivery_api.dart';
import 'freelancer_delivery_models.dart';
import 'freelancer_my_order_models.dart';

final freelancerDeliveryApiProvider = Provider<FreelancerDeliveryApi>((ref) {
  return FreelancerDeliveryApi(ref.watch(dioProvider));
});

class FreelancerDeliveryRepository {
  FreelancerDeliveryRepository(this._api);

  final FreelancerDeliveryApi _api;

  Future<FreelancerMyOrder> submitDelivery(
    String orderId,
    List<SelectedOrderAttachment> attachments,
  ) async {
    final formData = await buildFreelancerDeliveryFormData(attachments);
    return _api.submitDelivery(orderId, formData);
  }
}

final freelancerDeliveryRepositoryProvider = Provider<FreelancerDeliveryRepository>((ref) {
  return FreelancerDeliveryRepository(ref.watch(freelancerDeliveryApiProvider));
});
