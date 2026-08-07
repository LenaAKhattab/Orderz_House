import '../../../core/network/json_helpers.dart';

const int minClientReviewTextLength = 10;
const int maxClientReviewTextLength = 2000;

class ClientFreelancerReview {
  const ClientFreelancerReview({
    required this.id,
    required this.rating,
    this.reviewText,
    this.canEdit = false,
    this.communicationRating,
    this.deliveryRating,
    this.wouldRecommend,
    this.createdAt,
  });

  final String id;
  final int rating;
  final String? reviewText;
  final bool canEdit;
  final int? communicationRating;
  final int? deliveryRating;
  final bool? wouldRecommend;
  final String? createdAt;

  factory ClientFreelancerReview.fromJson(Map<String, dynamic> json) {
    return ClientFreelancerReview(
      id: readString(json, 'id', 'id'),
      rating: readInt(json, 'rating', 'rating') ?? 0,
      reviewText: readMapField<String>(json, 'reviewText', 'review_text'),
      canEdit: readBool(json, 'canEdit', 'can_edit'),
      communicationRating: readInt(json, 'communicationRating', 'communication_rating'),
      deliveryRating: readInt(json, 'deliveryRating', 'delivery_rating'),
      wouldRecommend: json['wouldRecommend'] is bool
          ? json['wouldRecommend'] as bool
          : json['would_recommend'] is bool
              ? json['would_recommend'] as bool
              : null,
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
    );
  }
}

class ClientOrderReviewStatus {
  const ClientOrderReviewStatus({
    this.canSubmit = false,
    this.existingReview,
    this.freelancerName,
    this.orderTitle,
  });

  final bool canSubmit;
  final ClientFreelancerReview? existingReview;
  final String? freelancerName;
  final String? orderTitle;

  bool get hasExistingReview => existingReview != null;

  factory ClientOrderReviewStatus.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      return ClientOrderReviewStatus.fromJson(Map<String, dynamic>.from(data));
    }
    return ClientOrderReviewStatus.fromJson(json);
  }

  factory ClientOrderReviewStatus.fromJson(Map<String, dynamic> json) {
    final existing = json['existingReview'] ?? json['existing_review'];
    return ClientOrderReviewStatus(
      canSubmit: readBool(json, 'canSubmit', 'can_submit'),
      existingReview: existing is Map
          ? ClientFreelancerReview.fromJson(Map<String, dynamic>.from(existing))
          : null,
      freelancerName: readMapField<String>(json, 'freelancerName', 'freelancer_name'),
      orderTitle: readMapField<String>(json, 'orderTitle', 'order_title'),
    );
  }
}

class SubmitClientOrderReviewPayload {
  const SubmitClientOrderReviewPayload({
    required this.rating,
    this.reviewText,
  });

  final int rating;
  final String? reviewText;

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{'rating': rating};
    final trimmed = reviewText?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      map['reviewText'] = trimmed;
    }
    return map;
  }
}

bool clientCanShowFreelancerReviewSection({
  required bool isClient,
  required String? orderStatus,
  required bool hasAssignedFreelancer,
}) {
  if (!isClient || !hasAssignedFreelancer) return false;
  return true;
}

bool clientOrderEligibleForReviewSubmit({
  required String? orderStatus,
  required bool hasAssignedFreelancer,
}) {
  return orderStatus == 'completed' && hasAssignedFreelancer;
}

String clientFreelancerReviewHeadlineAr({
  required String? orderStatus,
  required ClientOrderReviewStatus? status,
}) {
  if (orderStatus != 'completed') {
    return 'يمكنك تقييم المستقل بعد إكمال الطلب.';
  }
  final review = status?.existingReview;
  if (review != null) {
    return review.canEdit ? 'تم إرسال تقييمك — يمكنك تعديله خلال 48 ساعة.' : 'تم إرسال تقييمك لهذا الطلب.';
  }
  if (status?.canSubmit == true) {
    final name = status?.freelancerName?.trim();
    if (name != null && name.isNotEmpty) {
      return 'كيف كانت تجربتك مع $name؟';
    }
    return 'شاركنا تقييمك للمستقل.';
  }
  return 'تقييم المستقل';
}

String? validateClientReviewRating(int? rating) {
  if (rating == null || rating < 1 || rating > 5) {
    return 'اختر تقييماً من 1 إلى 5 نجوم.';
  }
  return null;
}

String? validateClientReviewText(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  if (trimmed.length < minClientReviewTextLength) {
    return 'الملاحظة يجب ألا تقل عن $minClientReviewTextLength أحرف.';
  }
  if (trimmed.length > maxClientReviewTextLength) {
    return 'الملاحظة طويلة جداً.';
  }
  return null;
}

String reviewStarsLabelAr(int rating) => '$rating / 5';
