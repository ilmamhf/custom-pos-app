/// Auth state management with Riverpod.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/network/dio_client.dart';
import '../../core/config/app_config.dart';

/// Current user data.
class User {
  const User({
    required this.id,
    required this.name,
    required this.role,
    required this.email,
  });

  final String id;
  final String name;
  final String role;
  final String email;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
      email: json['email'] as String,
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
      taxRateBps: json['taxRateBps'] as int,
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
    this.error,
  });

  final User? user;
  final List<UserStore> stores;
  final UserStore? selectedStore;
  final bool isLoading;
  final String? error;

  AuthState copyWith({
    User? user,
    List<UserStore>? stores,
    UserStore? selectedStore,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      stores: stores ?? this.stores,
      selectedStore: selectedStore ?? this.selectedStore,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
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
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final data = response.data as Map<String, dynamic>;
      final user = User.fromJson(data['user'] as Map<String, dynamic>);
      final stores = (data['stores'] as List)
          .map((s) => UserStore.fromJson(s as Map<String, dynamic>))
          .toList();

      await _authInterceptor.storeTokens(
        data['accessToken'] as String,
        data['refreshToken'] as String,
      );

      state = state.copyWith(
        user: user,
        stores: stores,
        selectedStore: stores.isNotEmpty ? stores.first : null,
        isLoading: false,
        error: null,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data['message'] as String? ?? 'Login failed',
      );
      rethrow;
    }
  }

  /// Select active store.
  void selectStore(UserStore store) {
    state = state.copyWith(selectedStore: store);
  }

  /// Logout and clear tokens.
  Future<void> logout() async {
    await _authInterceptor.clearTokens();
    state = const AuthState();
  }

  /// Clear error.
  void clearError() {
    state = state.copyWith(error: null);
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