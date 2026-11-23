/// Login screen for POS app.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config/app_config.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_products.dart';
import '../shift/shift_provider.dart';
import 'auth_provider.dart';

/// Login screen with email/password.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isPreparingDemo = false;
  String? _demoError;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      await ref.read(authProvider.notifier).login(
            _emailController.text.trim(),
            _passwordController.text,
          );
      if (mounted) {
        // Navigate to store selector or shift screen
        context.go('/store-selector');
      }
    } catch (e) {
      // Error is handled by auth provider
    }
  }

  Future<void> _openOfflineDemo() async {
    if (_isPreparingDemo) return;

    setState(() {
      _isPreparingDemo = true;
      _demoError = null;
    });

    try {
      final db = ref.read(databaseProvider);
      await db.syncDao.deleteEntriesForStore(demoStoreId);
      final updatedAt = DateTime.now().toUtc();
      final demoProducts = [
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-kopi',
          sku: 'DEMO-001',
          barcode: 'DEMO-001',
          name: 'Demo Kopi Susu',
          effectivePrice: 15000,
          stockOnHand: 20,
          isActive: true,
          updatedAt: updatedAt,
        ),
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-teh',
          sku: 'DEMO-002',
          barcode: 'DEMO-002',
          name: 'Demo Teh Manis',
          effectivePrice: 8000,
          stockOnHand: 30,
          isActive: true,
          updatedAt: updatedAt,
        ),
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-roti',
          sku: 'DEMO-003',
          barcode: 'DEMO-003',
          name: 'Demo Roti Bakar',
          effectivePrice: 12000,
          stockOnHand: 15,
          isActive: true,
          updatedAt: updatedAt,
        ),
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-air',
          sku: 'DEMO-004',
          barcode: 'DEMO-004',
          name: 'Demo Air Mineral',
          effectivePrice: 5000,
          stockOnHand: 40,
          isActive: true,
          updatedAt: updatedAt,
        ),
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-snack',
          sku: 'DEMO-005',
          barcode: 'DEMO-005',
          name: 'Demo Snack Kentang',
          effectivePrice: 18000,
          stockOnHand: 12,
          isActive: true,
          updatedAt: updatedAt,
        ),
        LocalProduct(
          storeId: demoStoreId,
          id: 'demo-product-susu',
          sku: 'DEMO-006',
          barcode: 'DEMO-006',
          name: 'Demo Susu UHT',
          effectivePrice: 10000,
          stockOnHand: 24,
          isActive: true,
          updatedAt: updatedAt,
        ),
      ];
      for (final product in demoProducts) {
        if (await db.productsDao.getProductById(product.id, storeId: demoStoreId) == null) {
          await db.productsDao.upsertProduct(product);
        }
      }

      ref.read(authProvider.notifier).startDemoSession();
      final shiftNotifier = ref.read(shiftProvider.notifier);
      await shiftNotifier.refresh();
      if (!ref.read(shiftProvider).isOpen) {
        await shiftNotifier.openShift(0, syncToServer: false);
      }

      if (!mounted) return;
      context.go('/pos');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isPreparingDemo = false;
        _demoError = 'Could not prepare the offline demo: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo/Title
                  Icon(
                    Icons.point_of_sale,
                    size: 80,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    AppConfig.appName,
                    style: theme.textTheme.displayMedium?.copyWith(
                      color: theme.colorScheme.primary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Sign in to continue',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Login Form
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Email Field
                            TextFormField(
                              controller: _emailController,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'Enter your email',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please enter your email';
                                }
                                if (!value.contains('@')) {
                                  return 'Enter a valid email';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),

                            // Password Field
                            TextFormField(
                              controller: _passwordController,
                              decoration: InputDecoration(
                                labelText: 'Password',
                                hintText: 'Enter your password',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_off
                                        : Icons.visibility,
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      _obscurePassword = !_obscurePassword;
                                    });
                                  },
                                ),
                              ),
                              obscureText: _obscurePassword,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _handleLogin(),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please enter your password';
                                }
                                if (value.length < 4) {
                                  return 'Password too short';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 8),

                            // Error Message
                            if (authState.error != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  authState.error!,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: theme.colorScheme.error,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),

                            const SizedBox(height: 24),

                            // Login Button
                            FilledButton(
                              onPressed:
                                  authState.isLoading ? null : _handleLogin,
                              style: FilledButton.styleFrom(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 16),
                              ),
                              child: authState.isLoading
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Text('Sign In'),
                            ),
                            if (kIsWeb) ...[
                              const SizedBox(height: 16),
                              const Divider(height: 1),
                              const SizedBox(height: 16),
                              OutlinedButton.icon(
                                onPressed:
                                    _isPreparingDemo ? null : _openOfflineDemo,
                                icon: _isPreparingDemo
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.science_outlined),
                                label: Text(
                                  _isPreparingDemo
                                      ? 'Preparing demo'
                                      : 'Open offline demo',
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Uses clearly labeled sample products. Demo data stays in this browser.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                                textAlign: TextAlign.center,
                              ),
                              if (_demoError != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                  _demoError!,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.error,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
