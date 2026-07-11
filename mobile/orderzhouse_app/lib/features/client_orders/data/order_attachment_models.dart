import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';

import 'order_attachment_limits.dart';

/// User-selected file kept in memory until create-order submit.
class SelectedOrderAttachment {
  SelectedOrderAttachment({
    required this.id,
    required this.name,
    required this.size,
    this.path,
    this.bytes,
  }) : assert(path != null || bytes != null, 'Attachment needs path or bytes');

  final String id;
  final String name;
  final int size;
  final String? path;
  final Uint8List? bytes;

  OrderAttachmentDraft get draft => OrderAttachmentDraft(name: name, size: size);

  Future<MultipartFile> toMultipartFile() async {
    if (bytes != null) {
      return MultipartFile.fromBytes(bytes!, filename: name);
    }
    if (path != null) {
      return MultipartFile.fromFile(path!, filename: name);
    }
    throw StateError('لا توجد بيانات للملف.');
  }

  static SelectedOrderAttachment? fromPlatformFile(PlatformFile file, {required String id}) {
    final name = file.name.trim();
    if (name.isEmpty) return null;
    final size = file.size;
    if (file.bytes != null) {
      return SelectedOrderAttachment(id: id, name: name, size: size, bytes: file.bytes);
    }
    if (file.path != null) {
      return SelectedOrderAttachment(id: id, name: name, size: size, path: file.path);
    }
    return null;
  }
}
