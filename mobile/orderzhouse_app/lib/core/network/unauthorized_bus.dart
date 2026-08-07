import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Lightweight bus so Dio interceptors can signal session expiry without importing auth.
class UnauthorizedBus {
  void Function()? onUnauthorized;

  void emit() => onUnauthorized?.call();
}

final unauthorizedBusProvider = Provider<UnauthorizedBus>((ref) {
  return UnauthorizedBus();
});
