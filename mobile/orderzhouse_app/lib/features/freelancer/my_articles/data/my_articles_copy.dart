/// Arabic copy for freelancer My Articles (مقالاتي) — web ord20 parity.
library;

import '../../mini_articles/data/bildazo_copy.dart';
import '../../../../core/i18n/i18n.dart';

export '../../mini_articles/data/bildazo_copy.dart'
    show
        bildazoPublishSuccessAr,
        bildazoViewArticleAr,
        bildazoViewWriterProfileAr,
        bildazoLinkedStatusAr,
        bildazoActivateCtaAr,
        bildazoRequiredAr;

String get myArticlesTitleAr => tr('مقالاتي');
String get myArticlesSubtitleAr => tr('أعمالك من Mini Article وحالة التدقيق والنشر على Bildazo.');
String get myArticlesEmptyTitleAr => tr('لم تبدأ بعد في تنفيذ أي مقالات.');
String get myArticlesEmptyDescAr => tr('عند الفوز بمقال، سيظهر هنا مع حالة التدقيق والنشر.');
String get myArticlesLoadErrorAr => tr('تعذر تحميل مقالاتك.');
String get myArticlesUnauthorizedAr => tr('يلزم تسجيل الدخول كمستقل لعرض مقالاتك.');
String get myArticlesForbiddenAr => tr('لا تملك صلاحية عرض هذه الصفحة.');
String get myArticlesAssignedAtAr => tr('تاريخ التعيين');
String get myArticlesSubmittedAtAr => tr('تاريخ التسليم');
String get myArticlesGrossLabelAr => tr('قيمة المقال');
String get myArticlesNetLabelAr => tr('صافي أجرك');
String get myArticlesReviewLabelAr => tr('حالة المراجعة');
String get myArticlesPublishLabelAr => tr('حالة النشر');
String get myArticlesRevisionNoteAr => tr('ملاحظة التعديل');

/// Aliases kept for M5 call sites — same strings as shared Bildazo copy.
final myArticlesPublishSuccessAr = bildazoPublishSuccessAr;
final myArticlesViewArticleAr = bildazoViewArticleAr;
final myArticlesViewProfileAr = bildazoViewWriterProfileAr;

String get myArticlesOpenLinkFailedAr => tr('تعذر فتح الرابط.');
String get myArticlesFilterAllAr => tr('الكل');
String get myArticlesPassiveSubmitHintAr => tr('تسليم المقال سيكون متاحاً من خلال تحديث قادم.');
String get myArticlesUnknownStatusAr => tr('قيد المتابعة');

String get myArticlesStatusAwaitingSelectionAr => tr('بانتظار الاختيار');
String get myArticlesStatusAwaitingExecutionAr => tr('بانتظار التنفيذ');
String get myArticlesStatusUnderReviewAr => tr('تحت التدقيق');
String get myArticlesStatusRevisionRequestedAr => tr('مطلوب تعديل');
String get myArticlesStatusAcceptedAr => tr('مقبولة');
String get myArticlesStatusPublishedAr => tr('منشورة على Bildazo');
String get myArticlesStatusRejectedAr => tr('مرفوضة');
