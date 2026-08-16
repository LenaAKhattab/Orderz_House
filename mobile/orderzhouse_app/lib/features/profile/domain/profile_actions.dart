import 'package:flutter/material.dart';

import '../../../core/router/routes.dart';
import '../../auth/domain/auth_user.dart';

enum ProfileActionId {
  myOrders,
  createOrder,
  notifications,
  legalHelp,
  financialClaims,
  marketplace,
  services,
  courses,
  login,
  register,
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
      return 'عميل';
    case 'freelancer':
      return 'مستقل';
    case 'admin':
      return 'مدير';
    case 'super_admin':
      return 'مدير عام';
    default:
      return user.effectiveRole;
  }
}

String? profileStatusLabelAr(AuthUser user) {
  if (!user.isActive) return 'الحساب غير نشط';
  return 'الحساب نشط';
}

String profileInitials(AuthUser user) {
  final name = user.displayName.trim();
  if (name.isEmpty) return 'م';
  return name.substring(0, 1).toUpperCase();
}

/// Quick actions for authenticated users (role-specific).
List<ProfileActionItem> profileQuickActionsForUser(AuthUser user) {
  if (user.usesFreelancerExperience) {
    return const [
      ProfileActionItem(
        id: ProfileActionId.myOrders,
        label: 'طلباتي كمستقل',
        icon: Icons.receipt_long_outlined,
        route: AppRoutes.myOrders,
      ),
      ProfileActionItem(
        id: ProfileActionId.courses,
        label: 'دوراتي التدريبية',
        icon: Icons.school_outlined,
        route: AppRoutes.courses,
      ),
      ProfileActionItem(
        id: ProfileActionId.services,
        label: 'الخدمات والتصنيفات',
        icon: Icons.grid_view_rounded,
        route: AppRoutes.services,
      ),
      ProfileActionItem(
        id: ProfileActionId.financialClaims,
        label: 'المطالبات المالية',
        icon: Icons.payments_outlined,
        route: AppRoutes.freelancerFinancialClaims,
      ),
      ProfileActionItem(
        id: ProfileActionId.notifications,
        label: 'الإشعارات',
        icon: Icons.notifications_outlined,
        route: AppRoutes.notifications,
      ),
      ProfileActionItem(
        id: ProfileActionId.marketplace,
        label: 'السوق',
        icon: Icons.storefront_outlined,
        route: AppRoutes.marketplace,
      ),
    ];
  }

  return const [
    ProfileActionItem(
      id: ProfileActionId.myOrders,
      label: 'طلباتي',
      icon: Icons.receipt_long_outlined,
      route: AppRoutes.myOrders,
    ),
    ProfileActionItem(
      id: ProfileActionId.createOrder,
      label: 'إنشاء طلب',
      icon: Icons.add_circle_outline,
      route: AppRoutes.clientCreateOrder,
    ),
    ProfileActionItem(
      id: ProfileActionId.services,
      label: 'الخدمات والتصنيفات',
      icon: Icons.grid_view_rounded,
      route: AppRoutes.services,
    ),
    ProfileActionItem(
      id: ProfileActionId.notifications,
      label: 'الإشعارات',
      icon: Icons.notifications_outlined,
      route: AppRoutes.notifications,
    ),
    ProfileActionItem(
      id: ProfileActionId.legalHelp,
      label: 'الصفحات القانونية والمساعدة',
      icon: Icons.help_outline,
      route: AppRoutes.helpCenterPublicRoute,
    ),
  ];
}

/// Legacy guest quick actions — unused in auth-first shell (profile is protected).
/// Kept for tests that assert guest marketplace CTA is not offered for browsing.
List<ProfileActionItem> profileGuestQuickActions() {
  return const [
    ProfileActionItem(
      id: ProfileActionId.login,
      label: 'تسجيل الدخول',
      icon: Icons.login_rounded,
      route: AppRoutes.login,
    ),
    ProfileActionItem(
      id: ProfileActionId.register,
      label: 'إنشاء حساب',
      icon: Icons.person_add_outlined,
      route: AppRoutes.register,
    ),
    ProfileActionItem(
      id: ProfileActionId.legalHelp,
      label: 'مركز المساعدة والسياسات',
      icon: Icons.help_outline,
      route: AppRoutes.helpCenterPublicRoute,
    ),
  ];
}

List<ProfileSettingsItem> profileAccountManagementItems() {
  return const [
    ProfileSettingsItem(
      id: ProfileSettingsId.accountSettings,
      label: 'إعدادات الحساب',
      icon: Icons.manage_accounts_outlined,
      route: AppRoutes.accountSettings,
    ),
  ];
}

List<ProfileSettingsItem> profileSettingsItems() {
  return [
    const ProfileSettingsItem(
      id: ProfileSettingsId.openWebsite,
      label: 'فتح الموقع',
      icon: Icons.open_in_new_rounded,
    ),
    const ProfileSettingsItem(
      id: ProfileSettingsId.aboutApp,
      label: 'عن التطبيق',
      icon: Icons.info_outline_rounded,
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.terms,
      label: 'الشروط والأحكام',
      icon: Icons.gavel_outlined,
      route: AppRoutes.publicPagePath(AppRoutes.termsConditions),
    ),
    ProfileSettingsItem(
      id: ProfileSettingsId.privacy,
      label: 'سياسة الخصوصية',
      icon: Icons.privacy_tip_outlined,
      route: AppRoutes.publicPagePath(AppRoutes.privacyPolicy),
    ),
    const ProfileSettingsItem(
      id: ProfileSettingsId.contactUs,
      label: 'تواصل معنا',
      icon: Icons.chat_outlined,
    ),
  ];
}

bool profileActionAllowedForUser(ProfileActionId id, AuthUser user) {
  switch (id) {
    case ProfileActionId.createOrder:
      return user.usesClientExperience;
    case ProfileActionId.financialClaims:
    case ProfileActionId.courses:
      return user.usesFreelancerExperience;
    case ProfileActionId.myOrders:
    case ProfileActionId.notifications:
    case ProfileActionId.legalHelp:
    case ProfileActionId.marketplace:
    case ProfileActionId.services:
    case ProfileActionId.login:
    case ProfileActionId.register:
      return true;
  }
}
