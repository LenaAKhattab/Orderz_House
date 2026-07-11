class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    this.firstName,
    this.fatherName,
    this.familyName,
    this.primaryRole,
    this.role,
    this.roles = const [],
    this.permissions = const [],
    this.isActive = true,
  });

  final String id;
  final String email;
  final String? firstName;
  final String? fatherName;
  final String? familyName;
  final String? primaryRole;
  final String? role;
  final List<String> roles;
  final List<String> permissions;
  final bool isActive;

  String get displayName {
    final parts = [firstName, fatherName, familyName]
        .where((p) => p != null && p.trim().isNotEmpty)
        .map((p) => p!.trim())
        .toList();
    if (parts.isNotEmpty) return parts.join(' ');
    return email;
  }

  String get effectiveRole => primaryRole ?? role ?? 'client';

  bool get isFreelancerAccount =>
      effectiveRole == 'freelancer' || roles.contains('freelancer');

  bool get isClientAccount =>
      effectiveRole == 'client' || roles.contains('client');

  /// Navigation: freelancer tab when primary role is freelancer.
  bool get usesFreelancerExperience => effectiveRole == 'freelancer';

  /// Navigation: client orders/create when primary role is client.
  bool get usesClientExperience => effectiveRole == 'client';

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final rolesRaw = json['roles'];
    final permissionsRaw = json['permissions'];
    return AuthUser(
      id: '${json['id'] ?? json['sub'] ?? ''}',
      email: '${json['email'] ?? ''}',
      firstName: json['firstName'] as String?,
      fatherName: json['fatherName'] as String?,
      familyName: json['familyName'] as String?,
      primaryRole: json['primaryRole'] as String?,
      role: json['role'] as String?,
      roles: rolesRaw is List
          ? rolesRaw.map((e) => e is String ? e : '$e').toList()
          : const [],
      permissions: permissionsRaw is List
          ? permissionsRaw.map((e) => e is String ? e : '$e').toList()
          : const [],
      isActive: json['isActive'] != false,
    );
  }
}

class AuthSession {
  const AuthSession({
    required this.user,
    this.accessToken,
    this.expiresIn,
  });

  final AuthUser user;
  final String? accessToken;
  final int? expiresIn;
}
