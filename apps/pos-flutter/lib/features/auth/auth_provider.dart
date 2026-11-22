/// Auth state management with Riverpod.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/network/dio_client.dart';

/// Identifiers reserved for the browser-only offline demo.
const demoUserId = 'demo-cashier';
const demoStoreId = 'demo-store';

/// Current user data.
class User {
  const User({
    required this.id,
    required this.name,
    required this.role,
    this.email,
  });

  final String id;
  final String name;
  final String role;
  final String? email;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Cashier',
      role: json['role'] as String? ?? 'CASHIER',
      email: json['email'] as String?,
    );
  }
}

/// Accessible store for current user.
class UserStore {
  const UserStore({
    required this.id,
    required this.name,
    required this.code,
    required this.taxRateBps,
  });

  final String id;
  final String name;
  final String code;
  final int taxRateBps;

  factory UserStore.fromJson(Map<String, dynamic> json) {
    return UserStore(
      id: json['id'] as String,
      name: json['name'] as String,
      code: json['code'] as String,
      taxRateBps: json['taxRateBps'] as int? ?? 0,
    );
  }
}

/// Auth state.
class AuthState {
  const AuthState({
    this.user,
    this.stores = const [],
    this.selectedStore,
    this.isLoading = false,
    this.isDemo = false,
    this.error,
  });

  final User? user;
  final List<UserStore> stores;
  final UserStore? selectedStore;
  final bool isLoading;
  final bool isDemo;
  final String? error;

  AuthState copyWith({
    User? user,
    List<UserStore>? stores,
    UserStore? selectedStore,
    bool? isLoading,
    bool? isDemo,
    String? error,
    bool clearError = false,
    bool clearStore = false,
  }) {
    return AuthState(
      user: user ?? this.user,
      stores: stores ?? this.stores,
      selectedStore: clearStore ? null : (selectedStore ?? this.selectedStore),
      isLoading: isLoading ?? this.isLoading,
      isDemo: isDemo ?? this.isDemo,
      error: clearError ? null : (error ?? this.error),
    );
  }

  bool get isLoggedIn => user != null;
  bool get hasSelectedStore => selectedStore != null;
}

/// Auth notifier for managing auth state.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._dio, this._authInterceptor) : super(const AuthState());

  final Dio _dio;
  final AuthInterceptor _authInterceptor;

  /// Login with email and password.
  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final response = await _dio.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final data = response.data as Map<String, dynamic>;
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      final stores = (data['stores'] as List? ?? const [])
          .map((s) => UserStore.fromJson(s as Map<String, dynamic>))
          .toList();

      await _authInterceptor.storeTokens(
        data['accessToken'] as String,
        data['refreshToken'] as String,
      );

      // The cashier explicitly picks a store, so multi-store users always see
      // the selector. A single accessible store is still confirmed there.
      state = AuthState(user: user, stores: stores);
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _messageFromError(e),
      );
      rethrow;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  /// Select active store.
  void selectStore(UserStore store) {
    state = state.copyWith(selectedStore: store, clearError: true);
  }

  /// Starts a local browser demo without creating server credentials.
  void startDemoSession() {
    const demoUser = User(
      id: demoUserId,
      name: 'Demo Cashier',
      role: 'CASHIER',
    );
    const demoStore = UserStore(
      id: demoStoreId,
      name: 'Demo Store',
      code: 'DEMO',
      taxRateBps: 1100,
    );
    state = const AuthState(
      user: demoUser,
      stores: [demoStore],
      selectedStore: demoStore,
      isDemo: true,
    );
  }

  /// Logout and clear tokens.
  Future<void> logout() async {
    await _authInterceptor.clearTokens();
    state = const AuthState();
  }

  /// Clear error.
  void clearError() {
    state = state.copyWith(clearError: true);
  }

  String _messageFromError(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      final message = data['message'];
      return message is List ? message.join(', ') : message.toString();
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return 'Cannot reach the server. Check the connection.';
    }
    return e.message ?? 'Login failed';
  }
}

/// Provider for Dio client.
final dioProvider = Provider<Dio>((ref) {
  throw UnimplementedError('Dio must be overridden in main.dart');
});

/// Provider for AuthInterceptor.
final authInterceptorProvider = Provider<AuthInterceptor>((ref) {
  throw UnimplementedError('AuthInterceptor must be overridden in main.dart');
});

/// Provider for AuthNotifier.
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final dio = ref.watch(dioProvider);
  final interceptor = ref.watch(authInterceptorProvider);
  return AuthNotifier(dio, interceptor);
});
