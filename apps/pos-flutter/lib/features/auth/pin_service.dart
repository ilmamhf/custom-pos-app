/// Manager PIN validation and verification.
///
/// Verification prefers `POST /auth/verify-pin`. The online response includes a
/// short-lived signed offline grant bound to the manager, store, and action.
/// Offline verification is only possible while such a grant is cached and
/// unexpired; cashier PIN hashes are keyed by store and user and cleared on
/// logout.

import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_provider.dart';

/// Storage key for the whole offline PIN cache (one JSON map).
const offlinePinCacheKey = 'offline_pin_cache';

/// How long an offline PIN entry may be used before it must be re-verified
/// online. Grants themselves also expire server-side.
const offlinePinTtl = Duration(days: 7);

/// Result of a PIN check.
class PinVerification {
  const PinVerification({
    required this.authorized,
    this.managerName,
    this.offline = false,
    this.grant,
    this.message,
  });

  final bool authorized;
  final String? managerName;
  final bool offline;

  /// Signed offline authorization grant, when available.
  final String? grant;
  final String? message;

  const PinVerification.denied([this.message])
      : authorized = false,
        managerName = null,
        offline = false,
        grant = null;
}

/// Validates a PIN for the 6-digit numeric format. Returns an error message or
/// null when the input is acceptable.
String? validatePin(String? value) {
  if (value == null || value.isEmpty) return 'Please enter PIN';
  if (!RegExp(r'^\d{6}$').hasMatch(value)) return 'PIN must be 6 digits';
  return null;
}

/// Iterated HMAC-SHA256 (PBKDF2-style) so offline guessing is materially more
/// expensive than a single SHA-256.
String hashPin(String pin, String salt, {int iterations = 20000}) {
  var digest = Hmac(sha256, utf8.encode(salt)).convert(utf8.encode(pin)).bytes;
  for (var i = 1; i < iterations; i++) {
    digest = Hmac(sha256, digest).convert(utf8.encode('$i:$salt')).bytes;
  }
  return digest.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Verifies manager PINs online with a scoped, expiring offline fallback.
class PinService {
  PinService({required Dio dio, required FlutterSecureStorage storage})
      : _dio = dio,
        _storage = storage;

  final Dio _dio;
  final FlutterSecureStorage _storage;

  /// Verifies [pin] for [storeId] and [userId].
  Future<PinVerification> verify(
    String pin, {
    String? storeId,
    String? userId,
  }) async {
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
        final grant = data['offlineGrant'] as String?;
        await _cache(
          pin: pin,
          managerName: managerName,
          grant: grant,
          storeId: storeId,
          userId: userId,
        );
        return PinVerification(
          authorized: true,
          managerName: managerName,
          grant: grant,
        );
      }
      return const PinVerification.denied('Invalid PIN');
    } on DioException catch (e) {
      // 4xx means the server answered: do not fall back, the PIN is wrong.
      final status = e.response?.statusCode;
      if (status != null && status >= 400 && status < 500) {
        return const PinVerification.denied('Invalid PIN');
      }
      return _verifyOffline(pin, storeId: storeId, userId: userId);
    }
  }

  Future<PinVerification> _verifyOffline(
    String pin, {
    String? storeId,
    String? userId,
  }) async {
    final entry = await _readEntry(storeId: storeId, userId: userId);
    if (entry == null) {
      return const PinVerification.denied(
        'Manager PIN cannot be verified offline on this device',
      );
    }

    final cachedAt = DateTime.tryParse(entry['cachedAt'] as String? ?? '');
    if (cachedAt == null ||
        DateTime.now().toUtc().difference(cachedAt.toUtc()) > offlinePinTtl) {
      return const PinVerification.denied(
        'Offline authorization has expired; reconnect to verify this PIN',
      );
    }

    final salt = entry['salt'] as String?;
    final cachedHash = entry['hash'] as String?;
    if (salt == null || cachedHash == null || hashPin(pin, salt) != cachedHash) {
      return const PinVerification.denied('Invalid PIN');
    }

    final grant = entry['grant'] as String?;
    if (grant == null || grant.isEmpty) {
      return const PinVerification.denied(
        'Offline refund authorization is unavailable; reconnect once to receive a grant',
      );
    }

    return PinVerification(
      authorized: true,
      managerName: entry['name'] as String?,
      offline: true,
      grant: grant,
    );
  }

  Future<void> _cache({
    required String pin,
    required String? managerName,
    required String? grant,
    required String? storeId,
    required String? userId,
  }) async {
    final cache = await _readCache();
    final key = _entryKey(storeId, userId);
    final existingSalt = (cache[key] as Map?)?['salt'] as String?;
    final salt = existingSalt ??
        DateTime.now().microsecondsSinceEpoch.toRadixString(16);

    cache[key] = {
      'salt': salt,
      'hash': hashPin(pin, salt),
      'name': managerName,
      'grant': grant,
      'cachedAt': DateTime.now().toUtc().toIso8601String(),
      'storeId': storeId,
      'userId': userId,
    };

    await _storage.write(key: offlinePinCacheKey, value: jsonEncode(cache));
  }

  Future<Map<String, dynamic>?> _readEntry({
    required String? storeId,
    required String? userId,
  }) async {
    final cache = await _readCache();
    final entry = cache[_entryKey(storeId, userId)];
    return entry is Map<String, dynamic> ? entry : null;
  }

  Future<Map<String, dynamic>> _readCache() async {
    final raw = await _storage.read(key: offlinePinCacheKey);
    if (raw == null || raw.isEmpty) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};
    } on FormatException {
      return <String, dynamic>{};
    }
  }

  String _entryKey(String? storeId, String? userId) =>
      '${userId ?? 'anonymous'}::${storeId ?? 'unknown'}';

  /// Clears cached PINs, optionally only one store/user pair. Call on logout
  /// and store switch.
  Future<void> clearCache({String? storeId, String? userId}) async {
    if (storeId == null && userId == null) {
      await _storage.delete(key: offlinePinCacheKey);
      return;
    }

    final cache = await _readCache();
    cache.removeWhere((key, value) {
      if (value is! Map) return true;
      final matchesStore = storeId == null || value['storeId'] == storeId;
      final matchesUser = userId == null || value['userId'] == userId;
      return matchesStore && matchesUser;
    });
    await _storage.write(key: offlinePinCacheKey, value: jsonEncode(cache));
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
