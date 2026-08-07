import '../../../core/network/json_helpers.dart';

class OrderFileDescriptor {
  const OrderFileDescriptor({
    required this.id,
    required this.displayName,
    this.purpose,
  });

  final String id;
  final String displayName;
  final String? purpose;

  bool get isBrief => purpose == null || purpose == 'brief' || purpose!.isEmpty;

  bool get isDelivery => purpose == 'delivery';

  factory OrderFileDescriptor.fromJson(Map<String, dynamic> json) {
    final id = readString(json, 'id', 'id');
    final rawName = readMapField<String>(json, 'originalName', 'original_name')?.trim();
    final displayName = rawName != null && rawName.isNotEmpty ? rawName : 'order-file-$id';
    return OrderFileDescriptor(
      id: id,
      displayName: displayName,
      purpose: readMapField<String>(json, 'purpose', 'purpose'),
    );
  }
}

List<OrderFileDescriptor> parseOrderFilesList(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => OrderFileDescriptor.fromJson(Map<String, dynamic>.from(e)))
      .where((f) => f.id.isNotEmpty)
      .toList();
}

List<OrderFileDescriptor> parseOrderFilesFromSubmissionJson(Map<String, dynamic> json) {
  return parseOrderFilesList(json['files']);
}
