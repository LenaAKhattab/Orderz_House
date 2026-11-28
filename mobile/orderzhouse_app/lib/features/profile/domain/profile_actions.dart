import 'package:flutter/material.dart';

import '../../../core/router/routes.dart';
import '../../auth/domain/auth_user.dart';
import '../../../core/i18n/i18n.dart';

enum ProfileActionId {
  myOrders,
  createOrder,
  notifications,
  legalHelp,
  financialClaims,
  accountActivation,
  miniArticles,
  myArticles,
  marketplace,
  services,
  courses,
  login,
  register,
  superAdminHome,
}

class ProfileActionItem {
  const ProfileActionItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.route,
  });

  final ProfileActionId id;
  final String label;
  final IconData icon;
  final String route;
}

enum ProfileSettingsId {
  openWebsite,
  aboutApp,
  terms,
  privacy,
  contactUs,
  accountSettings,
}

class ProfileSettingsItem {
  const ProfileSettingsItem({
    required this.id,
    required this.label,
    required this.icon,
    this.route,
    this.isPlaceholder = false,
    this.placeholderHint,
  });

  final ProfileSettingsId id;
  final String label;
  final IconData icon;
  final String? route;
  final bool isPlaceholder;
  final String? placeholderHint;
}

String profileRoleLabelAr(AuthUser user) {
  switch (user.effectiveRole) {
    case 'client':
      return tr('عميل');
    case 'freelancer':
      return tr('مستقل');
    case 'admin':
      return tr('مدير');
    case 'super_admin':
      return tr('مدير عام');
    default:
      return user.effectiveRole;
  }
}

/// Shown when staff `admin` lands on the generic client-like home (no SA tools).
String get regularAdminMobileDisabledMessageAr => tr('تجربة الأدمن على التطبيق غير مفعلة لهذا الدور حالياً. استخدم لوحة الويب.');


String? profileStatusLabelAr(AuthUser user) {
  if (!user.isActive) return tr('الحساب غير نشط');
  return tr('الحساب نشط');
}

String profileInitials(AuthUser user) {
  final name = user.displayName.trim();
  if (name.isEmpty) return tr('م');
  return name.substring(0, 1).toUpperCase();
}

/// Quick actions for authenticated users (role-specific).
List<ProfileActionItem> profileQuickActionsForUser(AuthUser user) {
  if (user.usesSuperAdminExperience) {
    return [
      ProfileActionItem(
        id: ProfileActionId.superAdminHome,
        label: tr('مركز المهام'),
        icon: Icons.dashboard_outlined,
        route: AppRoutes.home,
      ),
      ProfileActionItem(
        id: ProfileActionId.notifications,
        label: tr('الإشعارات'),
        icon: Icons.notifications_outlined,
        route: AppRoutes.notifications,
      ),
    ];
  }

  if (user.usesFreelancerExperience) {
    return [
      ProfileActionItem(
        id: ProfileActionId.myOrders,
        label: tr('طلباتي كمستقل'),
        icon: Icons.receipt_long_outlined,
        route: AppRoutes.myOrders,
      ),
      ProfileActionItem(
        id: ProfileActionId.accountActivation,
        label: tr('توثيق الهوية'),
        icon: Icons.verified_user_outlined,
        route: AppRoutes.freelancerAccountActivation,
      ),
      ProfileActionItem(
        id: ProfileActionId.miniArticles,
        label: tr('المقالات المصغّرة'),
        icon: Icons.article_outlined,
        route: AppRoutes.freelancerMiniArticles,
      ),
      ProfileActionItem(
        id: ProfileActionId.myArticles,
        label: tr('مقالاتي'),
        icon: Icons.library_books_outlined,
        route: AppRoutes.freelancerMyArticles,
      ),
      ProfileActionItem(
        id: ProfileActionId.courses,
        label: tr('دوراتي التدريبية'),
        icon: Icons.school_outlined,
        route: AppRoutes.courses,
      ),
      ProfileActionItem(
        id: ProfileActionId.services,
        label: tr('الخدمات والتصنيفات'),
        icon: Icons.grid_view_rounded,
        route: AppRoutes.services,
      ),
      ProfileActionItem(
        id: ProfileActionId.financialClaims,
        label: tr('المطالبات المالية'),
        icon: Icons.payments_outlined,
        route: AppRoutes.freelancerFinancialClaims,
      ),
      ProfileActionItem(
        id: ProfileActionId.notifications,
        label: tr('الإشعارات'),
        icon: Icons.notifications_outlined,
        route: AppRoutes.notifications,
      ),
      ProfileActionItem(
        id: ProfileActionId.marketplace,
        label: tr('السوق'),
        icon: Icons.storefront_outlined,
        route: AppRoutes.marketplace,
      ),
    ];
  }

  return [
    ProfileActionItem(
      id: ProfileActionId.myOrders,
      label: tr('طلباتي'),
      icon: Icons.receipt_long_outlined,
      route: AppRoutes.myOrders,
    ),
    ProfileActionItem(
      id: ProfileActionId.createOrder,
      label: tr('إنشاء طلب'),
      icon: Icons.add_circle_outline,
      route: AppRoutes.clientCreateOrder,
    ),
    ProfileActionItem(
      id: ProfileActionId.services,
      label: tr('الخدمات والتصنيفات'),
      icon: Icons.grid_view_rounded,
      route: AppRoutes.services,
    ),
    ProfileActionItem(
      id: ProfileActionId.notifications,
      label: tr('الإشعارات'),
      icon: Icons.notifications_outlined,
      route: AppRoutes.notifications,
    ),
    ProfileActionItem(
      id: ProfileActionId.legalHelp,
      label: tr('الصفحات القانونية والمساعدة'),
      icon: Icons.help_outline,
      route: AppRoutes.helpCenterPublicRoute,
    ),
  ];
}

/// Legacy guest quick actions — unused in auth-first shell (profile is protected).
/// Kept for tests that assert guest marketplace CTA is not offered for browsing.
List<ProfileActionItem> profileGuestQuickActions() {
  return [
    ProfileActionItem(
      id: ProfileActionId.login,
      label: tr('تسجيل الدخول'),
      icon: Icons.login_rounded,
      route: AppRoutes.login,
    ),
    ProfileActionItem(
      id: ProfileActionId.register,
      label: tr('إنشاء حساب'),
      icon: Icons.person_add_outlined,
      route: AppRoutes.register,
    ),
    ProfileActionItem(
      id: ProfileActionId.legalHelp,
      label: tr('مركز المساعدة والسياسات'),
      icon: Icons.help_outline,
      route: AppRoutes.helpCenterPublicRoute,
    ),
  ];
}

List<ProfileSettingsItem> profileAccountManagementItems() {
  return [
    ProfileSettingsItem(
      id: ProfileSettingsId.accountSettings,
      label: tr('إعدادات الحساب'),
      icon: Icons.manage_accounts_outlined,
      route: AppRoutes.accountSettings,
    ),
  ];
}

List<ProfileSettingsItem> profileSettingsItems() {
  return [
    ProfileSettingsItem(
      id: ProfileSettingsId.openWebsite,
      label: tr('فتح الموقع'),
      icon: Icons.open_in_new_rounded,
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.aboutApp,
      label: tr('عن التطبيق'),
      icon: Icons.info_outline_rounded,
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.terms,
      label: tr('الشروط والأحكام'),
      icon: Icons.gavel_outlined,
      route: AppRoutes.publicPagePath(AppRoutes.termsConditions),
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.privacy,
      label: tr('سياسة الخصوصية'),
      icon: Icons.privacy_tip_outlined,
      route: AppRoutes.publicPagePath(AppRoutes.privacyPolicy),
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.contactUs,
      label: tr('تواصل معنا'),
      icon: Icons.chat_outlined,
    ),
  ];
}

bool profileActionAllowedForUser(ProfileActionId id, AuthUser user) {
  switch (id) {
    case ProfileActionId.createOrder:
      return user.usesClientExperience;
    case ProfileActionId.financialClaims:
    case ProfileActionId.accountActivation:
    case ProfileActionId.miniArticles:
    case ProfileActionId.myArticles:
    case ProfileActionId.courses:
      return user.usesFreelancerExperience;
    case ProfileActionId.superAdminHome:
      return user.usesSuperAdminExperience;
    case ProfileActionId.myOrders:
    case ProfileActionId.marketplace:
    case ProfileActionId.services:
      return !user.usesSuperAdminExperience;
    case ProfileActionId.notifications:
    case ProfileActionId.legalHelp:
    case ProfileActionId.login:
    case ProfileActionId.register:
      return true;
  }
}
