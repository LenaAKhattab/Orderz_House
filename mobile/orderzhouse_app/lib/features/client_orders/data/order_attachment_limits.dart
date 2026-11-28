import '../../../core/i18n/i18n.dart';
// Mirrors backend `orderUploadLimits.js` and `ordersUploadMiddleware.js`.

const int maxOrderAttachmentCount = 5;
const int maxOrderAttachmentTotalBytes = 5 * 1024 * 1024;
const int maxOrderAttachmentTotalMb = 5;

String get orderAttachmentTotalSizeMessageAr => tr('حجم الملفات يجب ألا يتجاوز 5 ميجابايت إجمالاً');

String get orderAttachmentCountMessageAr => tr('عدد الملفات أكثر من المسموح (٥ كحد أقصى).');

String get orderAttachmentTypeMessageAr => tr('نوع الملف غير مدعوم.');

String get orderAttachmentHelperAr => tr('الحد الأقصى لإجمالي الملفات: 5 ميجابايت');

String get deliveryAttachmentRequiredMessageAr => tr('يجب إرفاق ملف واحد على الأقل.');

String get deliveryAttachmentHelperAr => tr('ملف واحد على الأقل — الحد الأقصى لإجمالي الملفات: 5 ميجابايت');

String get orderAttachmentOptionalNoteAr => tr('المرفقات اختيارية وتساعد المستقل على فهم الطلب.');

/// Field name for multipart uploads — matches web `fd.append("files", f)`.
const String orderAttachmentFormFieldName = 'files';

/// Extensions allowed by backend mime filter (client-side pre-check).
const Set<String> orderAttachmentAllowedExtensions = {
  'pdf',
  'zip',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'jpg',
  'jpeg',
  'png',
  'webp',
};

final RegExp _dangerousExtensionPattern = RegExp(
  r'\.(exe|bat|cmd|com|msi|scr|sh|bash|js|mjs|cjs|html|htm|xhtml|php|phtml|jar|dll|vbs|ps1|svg)(\?.*)?$',
  caseSensitive: false,
);

String formatAttachmentSize(int bytes) {
  if (bytes < 0) return tr('0 بايت');
  if (bytes < 1024) return trf('{0} بايت', [bytes]);
  if (bytes < 1024 * 1024) {
    final kb = bytes / 1024;
    return trf('{0} كيلوبايت', [kb.toStringAsFixed(kb < 10 ? 2 : 1)]);
  }
  final mb = bytes / (1024 * 1024);
  return trf('{0} ميجابايت', [mb.toStringAsFixed(mb < 10 ? 2 : 1)]);
}

int totalAttachmentBytes(Iterable<int> sizes) => sizes.fold(0, (sum, n) => sum + n);

String? extensionFromFileName(String name) {
  final trimmed = name.trim();
  final dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot >= trimmed.length - 1) return null;
  return trimmed.substring(dot + 1).toLowerCase();
}

bool isDangerousAttachmentName(String name) {
  if (name.contains('..')) return true;
  return _dangerousExtensionPattern.hasMatch(name);
}

bool isAllowedAttachmentName(String name) {
  if (isDangerousAttachmentName(name)) return false;
  final ext = extensionFromFileName(name);
  if (ext == null || ext.isEmpty) return false;
  return orderAttachmentAllowedExtensions.contains(ext);
}

class OrderAttachmentValidation {
  const OrderAttachmentValidation({this.message});

  final String? message;

  bool get isValid => message == null;
}

OrderAttachmentValidation validateOrderAttachments(List<OrderAttachmentDraft> files) {
  if (files.isEmpty) return const OrderAttachmentValidation();

  if (files.length > maxOrderAttachmentCount) {
    return OrderAttachmentValidation(message: orderAttachmentCountMessageAr);
  }

  for (final file in files) {
    if (!isAllowedAttachmentName(file.name)) {
      return OrderAttachmentValidation(message: orderAttachmentTypeMessageAr);
    }
  }

  final total = totalAttachmentBytes(files.map((f) => f.size));
  if (total > maxOrderAttachmentTotalBytes) {
    return OrderAttachmentValidation(message: orderAttachmentTotalSizeMessageAr);
  }

  return const OrderAttachmentValidation();
}

OrderAttachmentValidation validateDeliveryAttachments(List<OrderAttachmentDraft> files) {
  if (files.isEmpty) {
    return OrderAttachmentValidation(message: deliveryAttachmentRequiredMessageAr);
  }
  return validateOrderAttachments(files);
}

/// Lightweight attachment descriptor for validation and FormData (no I/O).
class OrderAttachmentDraft {
  const OrderAttachmentDraft({
    required this.name,
    required this.size,
  });

  final String name;
  final int size;
}
