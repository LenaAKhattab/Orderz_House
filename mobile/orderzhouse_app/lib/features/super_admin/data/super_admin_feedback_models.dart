import '../../../core/network/json_helpers.dart';
import 'super_admin_models.dart';

const superAdminFeedbackQueueTitleAr = 'المشاكل والاقتراحات';
const superAdminFeedbackEmptyAr = 'لا توجد ملاحظات حالياً.';
const superAdminFeedbackMarkReviewLabelAr = 'تعليمقيد المراجعة';
const superAdminFeedbackCloseLabelAr = 'إغلاق';
const superAdminFeedbackResolveLabelAr = 'تم الحل';
const superAdminFeedbackUpdateSuccessAr = 'تم تحديث حالة الملاحظة.';

class SuperAdminFeedbackItem {
  const SuperAdminFeedbackItem({
    required this.id,
    this.userName,
    this.userEmail,
    this.userRole,
    this.type,
    this.typeLabel,
    this.subject,
    this.description,
    this.status,
    this.priority,
    this.adminNote,
    this.createdAt,
    this.reviewedAt,
    this.resolvedAt,
  });

  final String id;
  final String? userName;
  final String? userEmail;
  final String? userRole;
  final String? type;
  final String? typeLabel;
  final String? subject;
  final String? description;
  final String? status;
  final String? priority;
  final String? adminNote;
  final String? createdAt;
  final String? reviewedAt;
  final String? resolvedAt;

  bool get isNew => (status ?? '').trim().toLowerCase() == 'new';

  String get preview {
    final body = (description ?? subject ?? '').trim();
    if (body.length <= 120) return body;
    return '${body.substring(0, 120)}…';
  }

  factory SuperAdminFeedbackItem.fromJson(Map<String, dynamic> json) {
    return SuperAdminFeedbackItem(
      id: readString(json, 'id', 'id'),
      userName: _nullIfEmpty(readString(json, 'userName', 'user_name')),
      userEmail: _nullIfEmpty(readString(json, 'userEmail', 'user_email')),
      userRole: _nullIfEmpty(readString(json, 'userRole', 'user_role')),
      type: _nullIfEmpty(readString(json, 'type', 'type')) ??
          _nullIfEmpty(readString(json, 'categoryKey', 'category_key')),
      typeLabel: _nullIfEmpty(readString(json, 'categoryLabel', 'category_label')) ??
          _nullIfEmpty(readString(json, 'typeLabel', 'type_label')),
      subject: _nullIfEmpty(readString(json, 'subject', 'subject')),
      description: _nullIfEmpty(readString(json, 'description', 'description')),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      priority: _nullIfEmpty(readString(json, 'priority', 'priority')),
      adminNote: _nullIfEmpty(readString(json, 'adminNote', 'admin_note')),
      createdAt: _nullIfEmpty(readString(json, 'createdAt', 'created_at')),
      reviewedAt: _nullIfEmpty(readString(json, 'reviewedAt', 'reviewed_at')),
      resolvedAt: _nullIfEmpty(readString(json, 'resolvedAt', 'resolved_at')),
    );
  }
}

String feedbackStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'new':
      return 'جديد';
    case 'in_review':
      return 'قيد المراجعة';
    case 'resolved':
      return 'تم الحل';
    case 'closed':
      return 'مغلق';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

String feedbackTypeLabelAr(SuperAdminFeedbackItem item) {
  final label = (item.typeLabel ?? '').trim();
  if (label.isNotEmpty) return label;
  switch ((item.type ?? '').trim().toLowerCase()) {
    case 'problem':
      return 'مشكلة';
    case 'suggestion':
      return 'اقتراح';
    case 'other':
      return 'ملاحظة أخرى';
    default:
      return superAdminFeedbackTileTitleAr;
  }
}

List<SuperAdminFeedbackItem> parseFeedbackList(dynamic body) {
  final data = _unwrap(body);
  if (data == null) return const [];
  final raw = data['items'] ?? data['feedback'] ?? data['results'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => SuperAdminFeedbackItem.fromJson(Map<String, dynamic>.from(e)))
      .toList();
}

int? parseFeedbackNewCount(dynamic body) {
  final data = _unwrap(body);
  if (data == null) return null;
  final summary = data['summary'];
  if (summary is Map) {
    final map = Map<String, dynamic>.from(summary);
    return readInt(map, 'new', 'new') ??
        readInt(map, 'newCount', 'new_count') ??
        readInt(map, 'pending', 'pending');
  }
  return parseFeedbackList(body).where((e) => e.isNew).length;
}

SuperAdminFeedbackItem? parseFeedbackDetail(dynamic body) {
  final data = _unwrap(body);
  if (data == null) return null;
  final raw = data['feedback'] ?? data['item'] ?? data;
  if (raw is! Map) return null;
  return SuperAdminFeedbackItem.fromJson(Map<String, dynamic>.from(raw));
}

Map<String, dynamic>? _unwrap(dynamic body) {
  if (body is! Map) return null;
  final map = Map<String, dynamic>.from(body);
  final data = map['data'];
  if (data is Map) return Map<String, dynamic>.from(data);
  return map;
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}
