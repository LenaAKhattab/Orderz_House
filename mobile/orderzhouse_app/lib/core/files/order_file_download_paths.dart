enum OrderFileDownloadRole {
  client,
  freelancer,
}

/// Authenticated download routes — no query token; Bearer via Dio only.
String buildOrderFileDownloadPath({
  required OrderFileDownloadRole role,
  required String orderId,
  required String fileId,
}) {
  final oid = Uri.encodeComponent(orderId);
  final fid = Uri.encodeComponent(fileId);
  switch (role) {
    case OrderFileDownloadRole.client:
      return '/client/orders/$oid/files/$fid/download';
    case OrderFileDownloadRole.freelancer:
      return '/freelancer/my-orders/$oid/files/$fid/download';
  }
}

/// Safe local filename — blocks path traversal and dangerous characters.
String sanitizeDownloadFileName(String? rawName, {required String fileId}) {
  var name = rawName?.trim() ?? '';
  if (name.isEmpty) return 'order-file-$fileId';

  name = name.replaceAll('\\', '/');
  if (name.contains('/')) {
    name = name.split('/').last;
  }
  name = name.replaceAll('..', '');
  name = name.replaceAll(RegExp(r'[<>:"|?*\x00-\x1F]'), '_');
  name = name.trim();
  if (name.isEmpty || name == '.' || name == '..') {
    return 'order-file-$fileId';
  }
  return name;
}

String orderFileDownloadFallbackName(String fileId) => 'order-file-$fileId';
