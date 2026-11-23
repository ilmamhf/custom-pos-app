/// Dio HTTP client with interceptors for POS app.

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

/// Creates and configures the Dio client.
Dio createDioClient({
  required FlutterSecureStorage secureStorage,
  String? baseUrl,
  AuthInterceptor? authInterceptor,
}) {
  final dio = Dio(BaseOptions(
    baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
    connectTimeout: Duration(seconds: AppConfig.requestTimeoutSeconds),
    receiveTimeout: Duration(seconds: AppConfig.requestTimeoutSeconds),
    sendTimeout: Duration(seconds: AppConfig.requestTimeoutSeconds),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  // Auth interceptor - adds JWT token
  dio.interceptors.add(authInterceptor ?? AuthInterceptor(secureStorage));

  // Store context interceptor - adds X-Store-Id header
  dio.interceptors.add(StoreContextInterceptor());

  // Retry interceptor - retries failed requests
  dio.interceptors.add(RetryInterceptor(
    retries: AppConfig.maxRetryAttempts,
    retryDelay: const Duration(seconds: 1),
  ));

  // Logging interceptor (debug only)
  // dio.interceptors.add(LogInterceptor(
  //   requestBody: true,
  //   responseBody: true,
  //   requestHeader: true,
  // ));

  return dio;
}

/// Interceptor that adds Authorization header with JWT token.
class AuthInterceptor extends Interceptor {
  final FlutterSecureStorage _secureStorage;
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';

  AuthInterceptor(this._secureStorage);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final accessToken = await _secureStorage.read(key: _accessTokenKey);
    if (accessToken != null && accessToken.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $accessToken';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // Handle 401 - try to refresh token
    if (err.response?.statusCode == 401 && err.requestOptions.path != '/auth/refresh') {
      final refreshed = await _tryRefreshToken();
      if (refreshed) {
        // Retry the original request with new token
        final accessToken = await _secureStorage.read(key: _accessTokenKey);
        if (accessToken != null) {
          err.requestOptions.headers['Authorization'] = 'Bearer $accessToken';
          final response = await Dio().fetch(err.requestOptions);
          handler.resolve(response);
          return;
        }
      }
    }
    handler.next(err);
  }

  Future<bool> _tryRefreshToken() async {
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;

    try {
      final response = await Dio().post(
        '${AppConfig.apiBaseUrl}/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        await _secureStorage.write(key: _accessTokenKey, value: data['accessToken'] as String);
        await _secureStorage.write(key: _refreshTokenKey, value: data['refreshToken'] as String);
        return true;
      }
    } catch (_) {
      // Refresh failed
    }
    return false;
  }

  /// Stores tokens after login.
  Future<void> storeTokens(String accessToken, String refreshToken) async {
    await _secureStorage.write(key: _accessTokenKey, value: accessToken);
    await _secureStorage.write(key: _refreshTokenKey, value: refreshToken);
  }

  /// Clears tokens and any cached offline PIN authorization on logout.
  Future<void> clearTokens() async {
    await _secureStorage.delete(key: _accessTokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    // The PIN cache can authorize refunds; it must not survive logout.
    await _secureStorage.delete(key: 'offline_pin_cache');
  }

  /// Gets current access token.
  Future<String?> getAccessToken() async {
    return _secureStorage.read(key: _accessTokenKey);
  }
}

/// Interceptor that adds X-Store-Id header for store-scoped requests.
class StoreContextInterceptor extends Interceptor {
  String? _storeId;

  void setStoreId(String storeId) {
    _storeId = storeId;
  }

  void clearStoreId() {
    _storeId = null;
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // Add store ID to all requests except auth endpoints
    if (_storeId != null && !options.path.startsWith('/auth/')) {
      options.headers['X-Store-Id'] = _storeId;
    }
    handler.next(options);
  }
}

/// Interceptor that retries failed requests with exponential backoff.
class RetryInterceptor extends Interceptor {
  final int retries;
  final Duration retryDelay;

  RetryInterceptor({
    required this.retries,
    required this.retryDelay,
  });

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final requestOptions = err.requestOptions;
    final retryCount = (requestOptions.extra['retry_count'] as int?) ?? 0;

    if (retryCount < retries && _shouldRetry(err)) {
      requestOptions.extra['retry_count'] = retryCount + 1;
      await Future.delayed(retryDelay * (retryCount + 1));
      
      try {
        final response = await Dio().fetch(requestOptions);
        handler.resolve(response);
        return;
      } catch (e) {
        // Retry failed, will be handled by next attempt or final error
      }
    }
    handler.next(err);
  }

  bool _shouldRetry(DioException err) {
    // Blindly replaying a non-idempotent write can duplicate stock movements
    // or refunds. Only safe methods (or requests carrying an explicit
    // Idempotency-Key) may be retried.
    final method = err.requestOptions.method.toUpperCase();
    final hasIdempotencyKey = err.requestOptions.headers.keys
        .any((key) => key.toLowerCase() == 'idempotency-key');
    final isSafe =
        const {'GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'}.contains(method) ||
            hasIdempotencyKey;
    if (!isSafe) return false;

    // Retry on network errors, timeouts, and 5xx errors
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.connectionError) {
      return true;
    }
    if (err.response?.statusCode != null && err.response!.statusCode! >= 500) {
      return true;
    }
    return false;
  }
}

/// API error mapper - converts Dio errors to app exceptions.
class ApiException implements Exception {
  final int statusCode;
  final String error;
  final String message;
  final DateTime timestamp;

  ApiException({
    required this.statusCode,
    required this.error,
    required this.message,
    required this.timestamp,
  });

  factory ApiException.fromDioError(DioException err) {
    if (err.response != null) {
      final data = err.response!.data;
      if (data is Map<String, dynamic>) {
        return ApiException(
          statusCode: err.response!.statusCode ?? 0,
          error: data['error'] as String? ?? 'UNKNOWN_ERROR',
          message: data['message'] as String? ?? err.message ?? 'Unknown error',
          timestamp: DateTime.parse(data['timestamp'] as String? ?? DateTime.now().toIso8601String()),
        );
      }
    }
    return ApiException(
      statusCode: err.response?.statusCode ?? 0,
      error: err.type.name,
      message: err.message ?? 'Network error',
      timestamp: DateTime.now(),
    );
  }

  @override
  String toString() => 'ApiException($statusCode): $error - $message';
}