import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../constants/api_constants.dart';

class SecureTokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  Future<String?> readAccessToken() =>
      _storage.read(key: ApiConstants.accessTokenStorageKey);

  Future<void> writeAccessToken(String token) => _storage.write(
        key: ApiConstants.accessTokenStorageKey,
        value: token,
      );

  Future<void> clearAccessToken() =>
      _storage.delete(key: ApiConstants.accessTokenStorageKey);

  Future<void> clearAll() => _storage.deleteAll();
}
