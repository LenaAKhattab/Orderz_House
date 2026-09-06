import '../../account/domain/account_validators.dart';

/// Public mobile/web signup may only create these account types.
abstract final class PublicSignupAccountType {
  static const client = 'client';
  static const freelancer = 'freelancer';

  static const allowed = <String>{client, freelancer};

  /// Never offered on public/mobile registration.
  static const blocked = <String>{
    'merchant',
    'admin',
    'super_admin',
    'program_admin',
    'financial_user',
  };
}

abstract final class FreelancerSignupCategory {
  static const design = 'design';
  static const contentWriting = 'content_writing';
  static const development = 'development';

  static const slugs = <String>[design, contentWriting, development];

  static const labelsAr = <String, String>{
    design: 'تصميم',
    contentWriting: 'كتابة محتوى',
    development: 'تطوير',
  };
}

String? validateRegisterPassword(String? value) {
  final p = value ?? '';
  if (p.isEmpty) return 'مطلوب';
  return PasswordRules.validateNewPassword(p);
}

String? validatePublicAccountType(String accountType) {
  final type = accountType.trim().toLowerCase();
  if (!PublicSignupAccountType.allowed.contains(type)) {
    return 'اختر نوع الحساب: عميل أو مستقل.';
  }
  return null;
}

String? validateFreelancerCategories({
  required String accountType,
  required Iterable<String> categories,
}) {
  if (accountType.trim().toLowerCase() != PublicSignupAccountType.freelancer) {
    return null;
  }
  final selected = categories
      .map((e) => e.trim())
      .where((e) => FreelancerSignupCategory.slugs.contains(e))
      .toList();
  if (selected.isEmpty) {
    return 'اختر تخصصًا واحدًا على الأقل.';
  }
  return null;
}

/// Backend public register accepts `accountType` (client|freelancer), never raw admin roles.
Map<String, dynamic> buildRegisterRequestBody({
  required String firstName,
  required String fatherName,
  required String familyName,
  required String email,
  required String password,
  required String confirmPassword,
  required String accountType,
  required String phoneNumber,
  List<String> categories = const [],
  String country = 'JO',
  String gender = 'ذكر',
}) {
  final type = accountType.trim().toLowerCase();
  if (!PublicSignupAccountType.allowed.contains(type)) {
    throw ArgumentError('accountType must be client or freelancer');
  }
  final body = <String, dynamic>{
    'firstName': firstName.trim(),
    'fatherName': fatherName.trim(),
    'familyName': familyName.trim(),
    'email': email.trim(),
    'password': password,
    'confirmPassword': confirmPassword,
    'accountType': type,
    'country': country,
    'phone': {'countryCode': '+962', 'number': phoneNumber.trim()},
    'whatsApp': {'countryCode': '+962', 'number': phoneNumber.trim()},
    'gender': gender,
    'termsAccepted': true,
  };
  if (type == PublicSignupAccountType.freelancer) {
    body['categories'] = categories
        .map((e) => e.trim())
        .where((e) => FreelancerSignupCategory.slugs.contains(e))
        .toList();
  }
  return body;
}
