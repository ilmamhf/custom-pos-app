import 'package:dio/dio.dart';

const patrolApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3100/api/v1',
);

/// Small API client for Patrol setup/assertions.
class PatrolApi {
  PatrolApi() : _dio = Dio(BaseOptions(baseUrl: patrolApiBaseUrl));

  final Dio _dio;
  String? _ownerToken;
  String? _storeId;

  Future<void> signInOwner() async {
    final res = await _dio.post('/auth/login', data: {
      'email': 'owner@toko.id',
      'password': 'password123',
    });
    _ownerToken = res.data['accessToken'] as String;
    final stores = (res.data['stores'] as List).cast<Map<String, dynamic>>();
    _storeId = (stores.firstWhere((s) => s['code'] == 'BKS'))['id'] as String;
  }

  String get storeId {
    final value = _storeId;
    if (value == null) {
      throw StateError('Call signInOwner() first');
    }
    return value;
  }

  Options _auth({bool withStore = false}) {
    final token = _ownerToken;
    if (token == null) {
      throw StateError('Call signInOwner() first');
    }
    return Options(headers: {
      'Authorization': 'Bearer $token',
      if (withStore) 'X-Store-Id': storeId,
    });
  }

  Future<Map<String, dynamic>> product(String sku) async {
    final res = await _dio.get('/products',
        queryParameters: {
          'storeId': storeId,
          'search': sku,
        },
        options: _auth());
    final items = (res.data['items'] as List).cast<Map<String, dynamic>>();
    return items.firstWhere((p) => p['sku'] == sku);
  }

  Future<int> stock(String sku) async {
    final item = await product(sku);
    return item['stockOnHand'] as int;
  }

  Future<int> salesCount() async {
    final res = await _dio.get(
      '/sales',
      queryParameters: {'storeId': storeId, 'limit': 100},
      options: _auth(),
    );
    return res.data['total'] as int;
  }

  Future<void> setPrice(String sku, int? priceOverride) async {
    final item = await product(sku);
    await _dio.put(
      '/stores/$storeId/products/${item['id']}/price',
      data: {'priceOverride': priceOverride},
      options: _auth(withStore: true),
    );
  }

  Future<bool> latestShiftClosed() async {
    final res = await _dio.get(
      '/shifts',
      queryParameters: {'storeId': storeId, 'limit': 10},
      options: _auth(),
    );
    final items = (res.data['items'] as List).cast<Map<String, dynamic>>();
    if (items.isEmpty) return false;
    return items.first['closedAt'] != null;
  }
}
