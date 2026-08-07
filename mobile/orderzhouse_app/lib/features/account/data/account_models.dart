import '../../../core/network/json_helpers.dart';

/// Full profile payload from GET /profile/me (safe fields only).
class AccountProfile {
  const AccountProfile({
    required this.id,
    required this.email,
    this.firstName,
    this.fatherName,
    this.familyName,
    this.phone,
    this.whatsApp,
    this.role,
    this.primaryRole,
    this.country,
    this.avatarUrl,
    this.professionalTitle,
    this.bio,
    this.companyName,
    this.billingCity,
    this.billingCountry,
    this.isActive = true,
  });

  final String id;
  final String email;
  final String? firstName;
  final String? fatherName;
  final String? familyName;
  final String? phone;
  final String? whatsApp;
  final String? role;
  final String? primaryRole;
  final String? country;
  final String? avatarUrl;
  final String? professionalTitle;
  final String? bio;
  final String? companyName;
  final String? billingCity;
  final String? billingCountry;
  final bool isActive;

  String get effectiveRole => primaryRole ?? role ?? 'client';

  bool get isFreelancer => effectiveRole == 'freelancer';

  bool get isClient => effectiveRole == 'client';

  String get displayName {
    final parts = [firstName, fatherName, familyName]
        .whereType<String>()
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isNotEmpty) return parts.join(' ');
    return email;
  }

  String get roleLabelAr {
    switch (effectiveRole) {
      case 'freelancer':
        return 'مستقل';
      case 'client':
        return 'عميل';
      case 'admin':
        return 'مسؤول';
      case 'super_admin':
        return 'مشرف أعلى';
      default:
        return effectiveRole;
    }
  }

  factory AccountProfile.fromJson(Map<String, dynamic> json) {
    final avatar = readString(json, 'avatarUrl', 'avatar_url').trim();
    return AccountProfile(
      id: readString(json, 'id', 'id'),
      email: readString(json, 'email', 'email'),
      firstName: _nullIfEmpty(readString(json, 'firstName', 'first_name')),
      fatherName: _nullIfEmpty(readString(json, 'fatherName', 'father_name')),
      familyName: _nullIfEmpty(readString(json, 'familyName', 'family_name')),
      phone: _nullIfEmpty(readString(json, 'phone', 'phone')),
      whatsApp: _nullIfEmpty(readString(json, 'whatsApp', 'whatsapp')),
      role: _nullIfEmpty(readString(json, 'role', 'role')),
      primaryRole: _nullIfEmpty(readString(json, 'primaryRole', 'primary_role')),
      country: _nullIfEmpty(readString(json, 'country', 'country')),
      avatarUrl: avatar.isEmpty ? null : resolveBackendAssetUrl(avatar),
      professionalTitle: _nullIfEmpty(readString(json, 'professionalTitle', 'professional_title')),
      bio: _nullIfEmpty(readString(json, 'bio', 'bio')),
      companyName: _nullIfEmpty(readString(json, 'companyName', 'company_name')),
      billingCity: _nullIfEmpty(readString(json, 'billingCity', 'billing_city')),
      billingCountry: _nullIfEmpty(readString(json, 'billingCountry', 'billing_country')),
      isActive: json['isActive'] != false && json['is_active'] != false,
    );
  }
}

class ProfileUpdatePayload {
  const ProfileUpdatePayload({
    this.firstName,
    this.fatherName,
    this.familyName,
    this.phone,
    this.whatsApp,
    this.professionalTitle,
    this.bio,
    this.companyName,
    this.billingCity,
    this.billingCountry,
  });

  final String? firstName;
  final String? fatherName;
  final String? familyName;
  final String? phone;
  final String? whatsApp;
  final String? professionalTitle;
  final String? bio;
  final String? companyName;
  final String? billingCity;
  final String? billingCountry;

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'firstName': firstName?.trim(),
      'fatherName': fatherName?.trim(),
      'familyName': familyName?.trim(),
      'phone': _emptyToNull(phone),
      'whatsApp': _emptyToNull(whatsApp),
    };
    if (professionalTitle != null) map['professionalTitle'] = professionalTitle!.trim();
    if (bio != null) map['bio'] = bio!.trim();
    if (companyName != null) map['companyName'] = companyName!.trim();
    if (billingCity != null) map['billingCity'] = billingCity!.trim();
    if (billingCountry != null) map['billingCountry'] = billingCountry!.trim().toUpperCase();
    return map;
  }
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}

String? _emptyToNull(String? value) {
  if (value == null) return null;
  final t = value.trim();
  return t.isEmpty ? null : t;
}
