// Mirrors backend `orderUploadLimits.js` and `ordersUploadMiddleware.js`.

const int maxOrderAttachmentCount = 5;
const int maxOrderAttachmentTotalBytes = 5 * 1024 * 1024;
const int maxOrderAttachmentTotalMb = 5;

const String orderAttachmentTotalSizeMessageAr =
    'حجم الملفات يجب ألا يتجاوز 5 ميجابايت إجمالاً';

const String orderAttachmentCountMessageAr = 'عدد الملفات أكثر من المسموح (٥ كحد أقصى).';

const String orderAttachmentTypeMessageAr = 'نوع الملف غير مدعوم.';

const String orderAttachmentHelperAr = 'الحد الأقصى لإجمالي الملفات: 5 ميجابايت';

const String deliveryAttachmentRequiredMessageAr = 'يجب إرفاق ملف واحد على الأقل.';

const String deliveryAttachmentHelperAr =
    'ملف واحد على الأقل — الحد الأقصى لإجمالي الملفات: 5 ميجابايت';

const String orderAttachmentOptionalNoteAr =
    'المرفقات اختيارية وتساعد المستقل على فهم الطلب.';

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
  if (bytes < 0) return '0 بايت';
  if (bytes < 1024) return '$bytes بايت';
  if (bytes < 1024 * 1024) {
    final kb = bytes / 1024;
    return '${kb.toStringAsFixed(kb < 10 ? 2 : 1)} كيلوبايت';
  }
  final mb = bytes / (1024 * 1024);
  return '${mb.toStringAsFixed(mb < 10 ? 2 : 1)} ميجابايت';
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
    return const OrderAttachmentValidation(message: orderAttachmentCountMessageAr);
  }

  for (final file in files) {
    if (!isAllowedAttachmentName(file.name)) {
      return const OrderAttachmentValidation(message: orderAttachmentTypeMessageAr);
    }
  }

  final total = totalAttachmentBytes(files.map((f) => f.size));
  if (total > maxOrderAttachmentTotalBytes) {
    return const OrderAttachmentValidation(message: orderAttachmentTotalSizeMessageAr);
  }

  return const OrderAttachmentValidation();
}

OrderAttachmentValidation validateDeliveryAttachments(List<OrderAttachmentDraft> files) {
  if (files.isEmpty) {
    return const OrderAttachmentValidation(message: deliveryAttachmentRequiredMessageAr);
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
