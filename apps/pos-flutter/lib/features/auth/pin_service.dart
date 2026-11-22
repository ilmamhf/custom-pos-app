/// Manager PIN validation and verification.
///
/// Verification prefers `POST /auth/verify-pin`. When the network is
/// unavailable the last successfully verified PIN is checked against a salted
/// SHA-256 hash kept in secure storage, so refunds and overrides still work
/// offline.

import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_provider.dart';

/// Result of a PIN check.
class PinVerification {
  const PinVerification({
    required this.authorized,
    this.managerName,
    this.offline = false,
    this.message,
  });

  final bool authorized;
  final String? managerName;
  final bool offline;
  final String? message;

  const PinVerification.denied([this.message])
      : authorized = false,
        managerName = null,
        offline = false;
}

/// Validates a PIN for the 6-digit numeric format. Returns an error message or
/// null when the input is acceptable.
String? validatePin(String? value) {
  if (value == null || value.isEmpty) return 'Please enter PIN';
  if (!RegExp(r'^\d{6}$').hasMatch(value)) return 'PIN must be 6 digits';
  return null;
}

/// Hashes a PIN with a salt for offline comparison.
String hashPin(String pin, String salt) {
  return sha256.convert(utf8.encode('$salt:$pin')).toString();
}

/// Verifies manager PINs online with an offline cached fallback.
class PinService {
  PinService({required Dio dio, required FlutterSecureStorage storage})
      : _dio = dio,
        _storage = storage;

  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const _saltKey = 'manager_pin_salt';
  static const _hashKey = 'manager_pin_hash';
  static const _nameKey = 'manager_pin_name';

  /// Verifies [pin] for [storeId].
  Future<PinVerification> verify(String pin, {String? storeId}) async {
    if (validatePin(pin) != null) {
      return PinVerification.denied('PIN must be 6 digits');
    }

    try {
      final response = await _dio.post('/auth/verify-pin', data: {
        'storeId': storeId,
        'pin': pin,
      });
      final data = response.data as Map<String, dynamic>;
      if (data['authorized'] == true) {
        final managerName = data['managerName'] as String?;
        await _cache(pin, managerName);
        return PinVerification(
          authorized: true,
          managerName: managerName,
        );
      }
      return const PinVerification.denied('Invalid PIN');
    } on DioException catch (e) {
      // 4xx means the server answered: do not fall back, the PIN is wrong.
      final status = e.response?.statusCode;
      if (status != null && status >= 400 && status < 500) {
        return const PinVerification.denied('Invalid PIN');
      }
      return _verifyOffline(pin);
    }
  }

  Future<PinVerification> _verifyOffline(String pin) async {
    final salt = await _storage.read(key: _saltKey);
    final cachedHash = await _storage.read(key: _hashKey);
    if (salt == null || cachedHash == null) {
      return const PinVerification.denied(
        'Manager PIN cannot be verified offline on this device',
      );
    }
    if (hashPin(pin, salt) != cachedHash) {
      return const PinVerification.denied('Invalid PIN');
    }
    final name = await _storage.read(key: _nameKey);
    return PinVerification(
      authorized: true,
      managerName: name,
      offline: true,
    );
  }

  Future<void> _cache(String pin, String? managerName) async {
    var salt = await _storage.read(key: _saltKey);
    if (salt == null) {
      salt = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
      await _storage.write(key: _saltKey, value: salt);
    }
    await _storage.write(key: _hashKey, value: hashPin(pin, salt));
    if (managerName != null) {
      await _storage.write(key: _nameKey, value: managerName);
    }
  }

  /// Clears the cached PIN (call on logout).
  Future<void> clearCache() async {
    await _storage.delete(key: _hashKey);
    await _storage.delete(key: _nameKey);
    await _storage.delete(key: _saltKey);
  }
}

/// Secure storage shared by auth and PIN caching.
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

/// Manager PIN verifier.
final pinServiceProvider = Provider<PinService>((ref) {
  return PinService(
    dio: ref.watch(dioProvider),
    storage: ref.watch(secureStorageProvider),
  );
});
