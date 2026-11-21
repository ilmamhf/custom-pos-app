/// Application configuration and environment constants.
class AppConfig {
  /// Base URL for the REST API.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );

  /// Default tax rate in basis points (11% = 1100 bps).
  static const int defaultTaxRateBps = 1100;

  /// Maximum number of retry attempts for network requests.
  static const int maxRetryAttempts = 3;

  /// Timeout for network requests in seconds.
  static const int requestTimeoutSeconds = 30;

  /// Sync interval in minutes.
  static const int syncIntervalMinutes = 5;

  /// Minimum touch target size for POS-friendly UI (in dp).
  static const double minTouchTargetSize = 48.0;

  /// App name for display.
  static const String appName = 'Retail POS';
}