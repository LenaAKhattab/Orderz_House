import 'package:dio/dio.dart';

import '../../data/plan_upgrade_cta.dart';
import 'mini_articles_models.dart';

const applyBidUsesBidAr = 'سيتم استخدام Bid عند التقديم على هذا المقال.';
const applyBidMayNotReturnAr =
    'في حال عدم اختيارك قد لا يعود رصيد التقديم حسب سياسة الفرصة.';
const applyInsufficientBidsAr = 'لا تملك رصيد Bids كافياً للتقديم.';
const bildazoRequiredAr =
    'لتتمكن من تنفيذ المقالات ونشر أعمالك باسمك، فعّل ملف الكاتب الخاص بك على Bildazo.';
const bildazoOpenWebCtaAr = 'تفعيل حساب الكاتب على Bildazo';
const bildazoViewArticleAr = 'مشاهدة المقال';
const bildazoViewWriterProfileAr = 'مشاهدة ملفي ككاتب';
const bildazoPublishSuccessAr = 'تم نشر مقالك بنجاح على Bildazo.';
const earnedBalanceTitleAr = 'الرصيد المكتسب من المقالات';
const earnedBalanceNotWithdrawableAr =
    'يعرض صافي أجر الكاتب فقط. الأرباح المعلّقة غير قابلة للسحب حتى تفعيل Silver.';
const earnedBalanceLockedHeadlineAr = 'أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.';
const earnedBalanceLockedCtaAr = 'اشترك لتفعيل السحب';
const earnedBalanceForfeitedHeadlineAr = 'انتهت مهلة تفعيل الأرباح.';
const earnedBalanceForfeitedDetailAr = 'الرصيد المعلّق السابق لم يعد متاحًا للسحب.';
const earnedBalancePendingAr = 'معلّق · غير قابل للسحب';
const earnedBalanceRecordedAr = 'مسجّل';
const earnedBalanceForfeitedAr = 'مغلق';

String? extractApiErrorCode(Object error) {
  if (error is! DioException) return null;
  final data = error.response?.data;
  if (data is Map) {
    final code = data['code'] ?? data['publicCode'] ?? data['errorCode'];
    if (code != null) return code.toString().trim();
  }
  return null;
}

String mapMiniArticleApplyErrorMessage(Object error, {String? fallback}) {
  final code = extractApiErrorCode(error);
  switch (code) {
    case 'INSUFFICIENT_BID_CREDITS':
      return applyInsufficientBidsAr;
    case 'BILDAZO_AUTHOR_LINK_REQUIRED':
      return bildazoRequiredAr;
    case 'ARTICLE_ACCESS_LEVEL_INSUFFICIENT':
    case 'ARTICLE_NO_USABLE_MEMBERSHIP':
      return 'هذا المقال يحتاج خطة أعلى.';
    case 'ARTICLE_BID_COLLECTION_THRESHOLD_REACHED':
    case 'ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET':
    case 'ARTICLE_BID_COLLECTION_DEADLINE_PASSED':
      return 'أُغلق باب التقديم على هذا المقال.';
    case 'ACTIVATION_CAMPAIGN_PAUSED':
    case 'ACTIVATION_WAVE_PAUSED':
    case 'ACTIVATION_CAMPAIGN_NOT_ACTIVE':
    case 'ACTIVATION_WAVE_NOT_ACTIVE':
    case 'ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED':
      return 'تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.';
    case 'FREELANCER_TRIAL_REQUIRED':
      return 'يلزم تفعيل تجربة العمل قبل التقديم على مقالات Mini Article.';
    case 'FREELANCER_TRIAL_EXPIRED':
      return 'انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.';
    case 'FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED':
      return 'وصلت للحد اليومي من عروض التجربة.';
    case 'FREELANCER_TRIAL_BID_LIMIT_REACHED':
      return 'وصلت للحد الأقصى من عروض التجربة.';
    case 'FREELANCER_TRIAL_WORK_CAP_REACHED':
      return 'وصلت للحد الأقصى من المقالات المقبولة في التجربة.';
    case 'FREELANCER_KYC_REQUIRED':
      return 'لا يمكن التقديم قبل تفعيل الحساب.';
    case 'FREELANCER_KYC_PENDING_REVIEW':
      return 'طلب تفعيل حسابك قيد المراجعة.';
    case 'FREELANCER_KYC_REJECTED':
      return 'تم رفض طلب تفعيل حسابك. يرجى مراجعة السبب وإعادة إرسال الطلب.';
    case 'ARTICLE_NOT_OPEN_FOR_APPLICATIONS':
      return 'هذا المقال غير مفتوح للتقديم حالياً.';
  }

  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) return message.trim();
    }
  }
  return fallback ?? 'تعذر تقديم الطلب.';
}

String? eligibilityMessageAr(ArticleApplicationEligibility? eligibility) {
  if (eligibility == null) return null;
  if (eligibility.eligible) return null;
  final code = eligibility.reason;
  switch (code) {
    case 'INSUFFICIENT_BID_CREDITS':
      return applyInsufficientBidsAr;
    case 'BILDAZO_AUTHOR_LINK_REQUIRED':
      return bildazoRequiredAr;
    case 'ARTICLE_ACCESS_LEVEL_INSUFFICIENT':
      return 'مستوى وصولك للمقالات أقل من مستوى هذا المقال.';
    case 'ARTICLE_NO_USABLE_MEMBERSHIP':
      return 'لا توجد عضوية صالحة للوصول إلى هذا المقال.';
    case 'ARTICLE_BID_COLLECTION_THRESHOLD_REACHED':
    case 'ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET':
    case 'ARTICLE_BID_COLLECTION_DEADLINE_PASSED':
      return 'أُغلق باب التقديم على هذا المقال.';
    case 'ACTIVATION_CAMPAIGN_PAUSED':
    case 'ACTIVATION_WAVE_PAUSED':
    case 'ACTIVATION_CAMPAIGN_NOT_ACTIVE':
    case 'ACTIVATION_WAVE_NOT_ACTIVE':
    case 'ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED':
      return 'تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.';
    case 'ARTICLE_APPLICATIONS_ENGINE_OFF':
    case 'ARTICLE_BID_ECONOMY_DISABLED':
      return 'التقديم على المقالات غير متاح حالياً.';
    case 'ARTICLE_NOT_OPEN_FOR_APPLICATIONS':
      return 'هذا المقال غير مفتوح للتقديم حالياً.';
    default:
      return code != null && code.isNotEmpty ? 'غير مؤهل للتقديم ($code).' : 'غير مؤهل للتقديم.';
  }
}

bool shouldShowArticlePlanUpgradeCta(ArticleApplicationEligibility? eligibility) {
  if (eligibility == null || eligibility.eligible) return false;
  return isPlanUpgradeReason(eligibility.reason);
}
