import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/unauthorized_bus.dart';
import '../../push/data/device_token_repository.dart';
import '../data/auth_repository.dart';
import '../domain/auth_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.isLoading = false,
    this.errorMessage,
  });

  final AuthStatus status;
  final AuthUser? user;
  final bool isLoading;
  final String? errorMessage;

  bool get isAuthenticated =>
      status == AuthStatus.authenticated && user != null;

  AuthState copyWith({
    AuthStatus? status,
    AuthUser? user,
    bool? isLoading,
    String? errorMessage,
    bool clearUser = false,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: clearUser ? null : (user ?? this.user),
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  late AuthRepository _repository;

  @override
  AuthState build() {
    _repository = ref.read(authRepositoryProvider);
    ref.read(unauthorizedBusProvider).onUnauthorized = handleUnauthorized;
    return const AuthState(status: AuthStatus.unknown);
  }

  Future<void> bootstrap() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository
          .bootstrapSession()
          .timeout(const Duration(seconds: 10), onTimeout: () => null);
      state = AuthState(
        status: user == null
            ? AuthStatus.unauthenticated
            : AuthStatus.authenticated,
        user: user,
      );
    } catch (_) {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository.login(email: email, password: password);
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      state = state.copyWith(isLoading: false, clearError: true);
      rethrow;
    }
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> body) {
    return _repository.register(body);
  }

  Future<void> requestForgotPasswordOtp(String email) {
    return _repository.forgotPassword(email: email);
  }

  Future<String> verifyForgotPasswordOtp({
    required String email,
    required String otp,
  }) {
    return _repository.verifyForgotPasswordOtp(email: email, otp: otp);
  }

  Future<void> resetPassword({
    required String email,
    required String resetToken,
    required String newPassword,
  }) {
    return _repository.resetPassword(
      email: email,
      resetToken: resetToken,
      newPassword: newPassword,
    );
  }

  Future<void> verifyOtp({
    required String email,
    required String otp,
  }) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final user = await _repository.verifyRegisterOtp(email: email, otp: otp);
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      state = state.copyWith(isLoading: false, clearError: true);
      rethrow;
    }
  }

  Future<void> logout() async {
    // Deactivate push token while access token is still available.
    try {
      await ref.read(deviceTokenRepositoryProvider).deactivateCurrentToken();
    } catch (_) {}
    await _repository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Refresh authenticated user from GET /auth/me without clearing the token.
  Future<void> refreshSessionUser() async {
    try {
      final user = await _repository.fetchMe();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (_) {
      // Keep existing session user on transient failures.
    }
  }

  void handleUnauthorized() {
    final tokens = ref.read(deviceTokenRepositoryProvider);
    final repo = _repository;
    // Deactivate while the access token is still readable by Dio, then clear.
    Future<void>(() async {
      try {
        await tokens.deactivateCurrentToken();
      } catch (_) {}
      await repo.clearLocalSession();
    });
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
