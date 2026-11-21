/// Application theme optimized for POS tablet usage.
/// Features large touch targets, high contrast, and readable typography.

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/app_config.dart';

/// Default number format for IDR currency display.
final NumberFormat _idrFormat = NumberFormat.currency(
  locale: 'id_ID',
  symbol: 'Rp ',
  decimalDigits: 0,
);

/// Custom text styles for POS interface.
class PosTextStyles {
  /// Large display text for totals (e.g., grand total on checkout).
  static const TextStyle displayLarge = TextStyle(
    fontSize: 48,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -0.5,
  );

  /// Medium display text for subtotals and line items.
  static const TextStyle displayMedium = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  /// Title text for section headers.
  static const TextStyle titleLarge = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  /// Body text for product names and descriptions.
  static const TextStyle bodyLarge = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  /// Body text for secondary information.
  static const TextStyle bodyMedium = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  /// Small text for labels and captions.
  static const TextStyle labelMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    height: 1.4,
  );

  /// Button text style.
  static const TextStyle buttonLarge = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  /// Monospace text for numeric input/display.
  static const TextStyle monoLarge = TextStyle(
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: FontWeight.w500,
    height: 1.3,
  );
}

/// Application color palette.
class PosColors {
  // Primary brand colors
  static const Color primary = Color(0xFF1B5E20); // Dark green
  static const Color primaryLight = Color(0xFF2E7D32);
  static const Color primaryDark = Color(0xFF103D14);
  static const Color primaryContainer = Color(0xFFC8E6C9);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFF052003);

  // Secondary colors
  static const Color secondary = Color(0xFF00695C); // Teal
  static const Color secondaryContainer = Color(0xFFA7F3D0);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color onSecondaryContainer = Color(0xFF00211B);

  // Surface colors
  static const Color surface = Color(0xFFFAFAFA);
  static const Color surfaceVariant = Color(0xFFF5F5F5);
  static const Color surfaceContainer = Color(0xFFEEEEEE);
  static const Color onSurface = Color(0xFF1C1B1F);
  static const Color onSurfaceVariant = Color(0xFF49454F);

  // Semantic colors
  static const Color success = Color(0xFF2E7D32);
  static const Color successContainer = Color(0xFFC8E6C9);
  static const Color onSuccessContainer = Color(0xFF052003);

  static const Color warning = Color(0xFFF57F17);
  static const Color warningContainer = Color(0xFFFFF3E0);
  static const Color onWarningContainer = Color(0xFF3E2700);

  static const Color error = Color(0xFFC62828);
  static const Color errorContainer = Color(0xFFFFEBEE);
  static const Color onErrorContainer = Color(0xFF410002);

  // Outline/border
  static const Color outline = Color(0xFFBDBDBD);
  static const Color outlineVariant = Color(0xFFE0E0E0);

  // Background
  static const Color background = Color(0xFFFFFFFF);
  static const Color onBackground = Color(0xFF1C1B1F);
}

/// Custom theme extension for POS-specific colors.
class PosThemeExtension extends ThemeExtension<PosThemeExtension> {
  final Color receiptBackground;
  final Color receiptText;
  final Color cartItemBackground;
  final Color cartItemSeparator;
  final Color keyboardBackground;
  final Color keyboardKeyBackground;
  final Color keyboardKeyText;

  const PosThemeExtension({
    required this.receiptBackground,
    required this.receiptText,
    required this.cartItemBackground,
    required this.cartItemSeparator,
    required this.keyboardBackground,
    required this.keyboardKeyBackground,
    required this.keyboardKeyText,
  });

  @override
  PosThemeExtension copyWith({
    Color? receiptBackground,
    Color? receiptText,
    Color? cartItemBackground,
    Color? cartItemSeparator,
    Color? keyboardBackground,
    Color? keyboardKeyBackground,
    Color? keyboardKeyText,
  }) {
    return PosThemeExtension(
      receiptBackground: receiptBackground ?? this.receiptBackground,
      receiptText: receiptText ?? this.receiptText,
      cartItemBackground: cartItemBackground ?? this.cartItemBackground,
      cartItemSeparator: cartItemSeparator ?? this.cartItemSeparator,
      keyboardBackground: keyboardBackground ?? this.keyboardBackground,
      keyboardKeyBackground: keyboardKeyBackground ?? this.keyboardKeyBackground,
      keyboardKeyText: keyboardKeyText ?? this.keyboardKeyText,
    );
  }

  @override
  PosThemeExtension lerp(ThemeExtension<PosThemeExtension>? other, double t) {
    if (other is! PosThemeExtension) return this;
    return PosThemeExtension(
      receiptBackground: Color.lerp(receiptBackground, other.receiptBackground, t)!,
      receiptText: Color.lerp(receiptText, other.receiptText, t)!,
      cartItemBackground: Color.lerp(cartItemBackground, other.cartItemBackground, t)!,
      cartItemSeparator: Color.lerp(cartItemSeparator, other.cartItemSeparator, t)!,
      keyboardBackground: Color.lerp(keyboardBackground, other.keyboardBackground, t)!,
      keyboardKeyBackground: Color.lerp(keyboardKeyBackground, other.keyboardKeyBackground, t)!,
      keyboardKeyText: Color.lerp(keyboardKeyText, other.keyboardKeyText, t)!,
    );
  }
}

/// Builds the light theme for the POS app.
ThemeData buildLightTheme() {
  final colorScheme = ColorScheme.light(
    primary: PosColors.primary,
    onPrimary: PosColors.onPrimary,
    primaryContainer: PosColors.primaryContainer,
    onPrimaryContainer: PosColors.onPrimaryContainer,
    secondary: PosColors.secondary,
    onSecondary: PosColors.onSecondary,
    secondaryContainer: PosColors.secondaryContainer,
    onSecondaryContainer: PosColors.onSecondaryContainer,
    surface: PosColors.surface,
    onSurface: PosColors.onSurface,
    surfaceContainer: PosColors.surfaceContainer,
    onSurfaceVariant: PosColors.onSurfaceVariant,
    error: PosColors.error,
    onError: Colors.white,
    errorContainer: PosColors.errorContainer,
    onErrorContainer: PosColors.onErrorContainer,
    outline: PosColors.outline,
    outlineVariant: PosColors.outlineVariant,
    background: PosColors.background,
    onBackground: PosColors.onBackground,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    fontFamily: 'Roboto',
    textTheme: const TextTheme(
      displayLarge: PosTextStyles.displayLarge,
      displayMedium: PosTextStyles.displayMedium,
      displaySmall: PosTextStyles.titleLarge,
      headlineLarge: PosTextStyles.titleLarge,
      headlineMedium: PosTextStyles.bodyLarge,
      headlineSmall: PosTextStyles.bodyMedium,
      titleLarge: PosTextStyles.titleLarge,
      titleMedium: PosTextStyles.bodyLarge,
      titleSmall: PosTextStyles.bodyMedium,
      bodyLarge: PosTextStyles.bodyLarge,
      bodyMedium: PosTextStyles.bodyMedium,
      bodySmall: PosTextStyles.labelMedium,
      labelLarge: PosTextStyles.buttonLarge,
      labelMedium: PosTextStyles.labelMedium,
      labelSmall: PosTextStyles.labelMedium,
    ).apply(
      bodyColor: PosColors.onSurface,
      displayColor: PosColors.onSurface,
    ),
    extensions: <ThemeExtension<dynamic>>[
      const PosThemeExtension(
        receiptBackground: Colors.white,
        receiptText: Colors.black,
        cartItemBackground: Colors.white,
        cartItemSeparator: PosColors.outlineVariant,
        keyboardBackground: PosColors.surfaceVariant,
        keyboardKeyBackground: Colors.white,
        keyboardKeyText: PosColors.onSurface,
      ),
    ],
    scaffoldBackgroundColor: PosColors.background,
    appBarTheme: AppBarTheme(
      backgroundColor: PosColors.primary,
      foregroundColor: PosColors.onPrimary,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: PosTextStyles.titleLarge.copyWith(color: PosColors.onPrimary),
      iconTheme: IconThemeData(color: PosColors.onPrimary, size: 28),
      actionsIconTheme: IconThemeData(color: PosColors.onPrimary, size: 28),
      toolbarHeight: 64,
    ),
    cardTheme: CardThemeData(
      color: PosColors.surface,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: PosColors.outlineVariant, width: 1),
      ),
      margin: const EdgeInsets.all(8),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: PosColors.primary,
        foregroundColor: PosColors.onPrimary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: PosTextStyles.buttonLarge,
        elevation: 2,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: PosColors.primary,
        foregroundColor: PosColors.onPrimary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: PosTextStyles.buttonLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: PosColors.primary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: PosColors.primary, width: 2),
        textStyle: PosTextStyles.buttonLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: PosColors.primary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: PosTextStyles.labelMedium,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: PosColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: PosColors.outline, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: PosColors.outline, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: PosColors.primary, width: 2.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: PosColors.error, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: PosColors.error, width: 2.5),
      ),
      labelStyle: PosTextStyles.bodyMedium.copyWith(color: PosColors.onSurfaceVariant),
      hintStyle: PosTextStyles.bodyMedium.copyWith(color: PosColors.onSurfaceVariant.withOpacity(0.6)),
      floatingLabelStyle: PosTextStyles.labelMedium.copyWith(color: PosColors.primary),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: PosColors.surfaceContainer,
      selectedColor: PosColors.primaryContainer,
      labelStyle: PosTextStyles.labelMedium,
      secondaryLabelStyle: PosTextStyles.labelMedium.copyWith(color: PosColors.onPrimaryContainer),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: PosColors.outlineVariant),
      ),
      side: BorderSide(color: PosColors.outlineVariant),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: PosColors.surface,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      titleTextStyle: PosTextStyles.titleLarge.copyWith(color: PosColors.onSurface),
      contentTextStyle: PosTextStyles.bodyLarge.copyWith(color: PosColors.onSurface),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: PosColors.surface,
      elevation: 8,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      modalBackgroundColor: PosColors.surface,
    ),
    dividerTheme: DividerThemeData(
      color: PosColors.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      titleTextStyle: PosTextStyles.bodyLarge,
      subtitleTextStyle: PosTextStyles.bodyMedium,
      minLeadingWidth: 40,
      minVerticalPadding: 12,
    ),
    tabBarTheme: TabBarThemeData(
      labelStyle: PosTextStyles.labelMedium.copyWith(fontWeight: FontWeight.w600),
      unselectedLabelStyle: PosTextStyles.labelMedium,
      labelColor: PosColors.primary,
      unselectedLabelColor: PosColors.onSurfaceVariant,
      indicatorColor: PosColors.primary,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: Colors.transparent,
      overlayColor: WidgetStateProperty.resolveWith<Color?>(
        (states) => states.contains(WidgetState.pressed)
            ? PosColors.primaryContainer
            : null,
      ),
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: PosColors.primary,
      inactiveTrackColor: PosColors.outlineVariant,
      thumbColor: PosColors.primary,
      overlayColor: PosColors.primary.withOpacity(0.12),
      valueIndicatorColor: PosColors.primary,
      valueIndicatorTextStyle: PosTextStyles.labelMedium.copyWith(color: PosColors.onPrimary),
      trackHeight: 4,
      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 12),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: PosColors.primary,
      linearTrackColor: PosColors.outlineVariant,
      circularTrackColor: PosColors.outlineVariant,
    ),
  );
}

/// Builds the dark theme for the POS app (for low-light environments).
ThemeData buildDarkTheme() {
  final colorScheme = ColorScheme.dark(
    primary: Color(0xFF81C784), // Light green
    onPrimary: Color(0xFF052003),
    primaryContainer: Color(0xFF1B5E20),
    onPrimaryContainer: Color(0xFFC8E6C9),
    secondary: Color(0xFF4DB6AC), // Light teal
    onSecondary: Color(0xFF00211B),
    secondaryContainer: Color(0xFF00695C),
    onSecondaryContainer: Color(0xFFA7F3D0),
    surface: Color(0xFF1E1E1E),
    onSurface: Color(0xFFE0E0E0),
    surfaceContainer: Color(0xFF2C2C2C),
    onSurfaceVariant: Color(0xFFB0B0B0),
    error: Color(0xFFEF5350),
    onError: Color(0xFF1B0000),
    errorContainer: Color(0xFFB71C1C),
    onErrorContainer: Color(0xFFFFDAD6),
    outline: Color(0xFF757575),
    outlineVariant: Color(0xFF424242),
    background: Color(0xFF121212),
    onBackground: Color(0xFFE0E0E0),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    fontFamily: 'Roboto',
    textTheme: const TextTheme(
      displayLarge: PosTextStyles.displayLarge,
      displayMedium: PosTextStyles.displayMedium,
      displaySmall: PosTextStyles.titleLarge,
      headlineLarge: PosTextStyles.titleLarge,
      headlineMedium: PosTextStyles.bodyLarge,
      headlineSmall: PosTextStyles.bodyMedium,
      titleLarge: PosTextStyles.titleLarge,
      titleMedium: PosTextStyles.bodyLarge,
      titleSmall: PosTextStyles.bodyMedium,
      bodyLarge: PosTextStyles.bodyLarge,
      bodyMedium: PosTextStyles.bodyMedium,
      bodySmall: PosTextStyles.labelMedium,
      labelLarge: PosTextStyles.buttonLarge,
      labelMedium: PosTextStyles.labelMedium,
      labelSmall: PosTextStyles.labelMedium,
    ).apply(
      bodyColor: colorScheme.onSurface,
      displayColor: colorScheme.onSurface,
    ),
    extensions: <ThemeExtension<dynamic>>[
      const PosThemeExtension(
        receiptBackground: Color(0xFF1E1E1E),
        receiptText: Color(0xFFE0E0E0),
        cartItemBackground: Color(0xFF2C2C2C),
        cartItemSeparator: Color(0xFF424242),
        keyboardBackground: Color(0xFF2C2C2C),
        keyboardKeyBackground: Color(0xFF3C3C3C),
        keyboardKeyText: Color(0xFFE0E0E0),
      ),
    ],
    scaffoldBackgroundColor: colorScheme.background,
    appBarTheme: AppBarTheme(
      backgroundColor: colorScheme.primaryContainer,
      foregroundColor: colorScheme.onPrimaryContainer,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: PosTextStyles.titleLarge.copyWith(color: colorScheme.onPrimaryContainer),
      iconTheme: IconThemeData(color: colorScheme.onPrimaryContainer, size: 28),
      actionsIconTheme: IconThemeData(color: colorScheme.onPrimaryContainer, size: 28),
      toolbarHeight: 64,
    ),
    cardTheme: CardThemeData(
      color: colorScheme.surface,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: colorScheme.outlineVariant, width: 1),
      ),
      margin: const EdgeInsets.all(8),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: PosTextStyles.buttonLarge,
        elevation: 2,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: PosTextStyles.buttonLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: colorScheme.primary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: colorScheme.primary, width: 2),
        textStyle: PosTextStyles.buttonLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: colorScheme.primary,
        minimumSize: Size(AppConfig.minTouchTargetSize, AppConfig.minTouchTargetSize),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: PosTextStyles.labelMedium,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: colorScheme.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.outline, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.outline, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.primary, width: 2.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.error, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.error, width: 2.5),
      ),
      labelStyle: PosTextStyles.bodyMedium.copyWith(color: colorScheme.onSurfaceVariant),
      hintStyle: PosTextStyles.bodyMedium.copyWith(color: colorScheme.onSurfaceVariant.withOpacity(0.6)),
      floatingLabelStyle: PosTextStyles.labelMedium.copyWith(color: colorScheme.primary),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      selectedColor: colorScheme.primaryContainer,
      labelStyle: PosTextStyles.labelMedium,
      secondaryLabelStyle: PosTextStyles.labelMedium.copyWith(color: colorScheme.onPrimaryContainer),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      side: BorderSide(color: colorScheme.outlineVariant),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: colorScheme.surface,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      titleTextStyle: PosTextStyles.titleLarge.copyWith(color: colorScheme.onSurface),
      contentTextStyle: PosTextStyles.bodyLarge.copyWith(color: colorScheme.onSurface),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: colorScheme.surface,
      elevation: 8,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      modalBackgroundColor: colorScheme.surface,
    ),
    dividerTheme: DividerThemeData(
      color: colorScheme.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      titleTextStyle: PosTextStyles.bodyLarge,
      subtitleTextStyle: PosTextStyles.bodyMedium,
      minLeadingWidth: 40,
      minVerticalPadding: 12,
    ),
    tabBarTheme: TabBarThemeData(
      labelStyle: PosTextStyles.labelMedium.copyWith(fontWeight: FontWeight.w600),
      unselectedLabelStyle: PosTextStyles.labelMedium,
      labelColor: colorScheme.primary,
      unselectedLabelColor: colorScheme.onSurfaceVariant,
      indicatorColor: colorScheme.primary,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: Colors.transparent,
      overlayColor: WidgetStateProperty.resolveWith<Color?>(
        (states) => states.contains(WidgetState.pressed)
            ? colorScheme.primaryContainer
            : null,
      ),
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: colorScheme.primary,
      inactiveTrackColor: colorScheme.outlineVariant,
      thumbColor: colorScheme.primary,
      overlayColor: colorScheme.primary.withOpacity(0.12),
      valueIndicatorColor: colorScheme.primary,
      valueIndicatorTextStyle: PosTextStyles.labelMedium.copyWith(color: colorScheme.onPrimary),
      trackHeight: 4,
      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 12),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: colorScheme.primary,
      linearTrackColor: colorScheme.outlineVariant,
      circularTrackColor: colorScheme.outlineVariant,
    ),
  );
}

/// Formats an integer IDR amount using the app's standard format.
String formatCurrency(int amount) => _idrFormat.format(amount);

/// Parses a currency string to integer IDR.
int parseCurrency(String text) => int.tryParse(text.replaceAll(RegExp(r'[^\d-]'), '')) ?? 0;