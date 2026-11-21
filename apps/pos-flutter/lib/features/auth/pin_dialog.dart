/// PIN verification dialog for manager overrides.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/dio_client.dart';

/// Shows a PIN verification dialog for manager overrides.
/// Returns true if PIN is verified, false otherwise.
Future<bool> showPinDialog(
  BuildContext context, {
  required String title,
  required String message,
  required Dio dio,
  String? storeId,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => _PinDialog(
      title: title,
      message: message,
      dio: dio,
      storeId: storeId,
    ),
  );
  return result ?? false;
}

/// PIN dialog widget.
class _PinDialog extends ConsumerStatefulWidget {
  const _PinDialog({
    required this.title,
    required this.message,
    required this.dio,
    this.storeId,
  });

  final String title;
  final String message;
  final Dio dio;
  final String? storeId;

  @override
  ConsumerState<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends ConsumerState<_PinDialog> {
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _verifyPin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await widget.dio.post(
        '/auth/verify-pin',
        data: {
          'storeId': widget.storeId,
          'pin': _pinController.text,
        },
      );

      if (response.statusCode == 200 && response.data['authorized'] == true) {
        if (mounted) {
          Navigator.of(context).pop(true);
        }
      } else {
        setState(() {
          _error = 'Invalid PIN';
          _isLoading = false;
        });
      }
    } on Exception catch (e) {
      setState(() {
        _error = 'Verification failed: ${e.toString()}';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Icon(
                Icons.lock_outline,
                size: 48,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 16),
              Text(
                widget.title,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                widget.message,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // PIN Input
              TextFormField(
                controller: _pinController,
                decoration: InputDecoration(
                  labelText: 'Manager PIN',
                  hintText: 'Enter 6-digit PIN',
                  prefixIcon: const Icon(Icons.pin),
                  errorText: _error,
                  counterText: '',
                ),
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 6,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _verifyPin(),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter PIN';
                  }
                  if (value.length != 6) {
                    return 'PIN must be 6 digits';
                  }
                  if (!RegExp(r'^\d{6}$').hasMatch(value)) {
                    return 'PIN must be numeric';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 24),

              // Error Message
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _error!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.error,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),

              // Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isLoading
                          ? null
                          : () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _isLoading ? null : _verifyPin,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Verify'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Widget for entering numeric PIN with large keypad (for POS hardware).
class PinKeypad extends StatefulWidget {
  const PinKeypad({
    super.key,
    required this.onComplete,
    this.onCancel,
    this.length = 6,
    this.obscureText = true,
  });

  final ValueChanged<String> onComplete;
  final VoidCallback? onCancel;
  final int length;
  final bool obscureText;

  @override
  State<PinKeypad> createState() => _PinKeypadState();
}

class _PinKeypadState extends State<PinKeypad> {
  final _pin = StringBuffer();

  void _addDigit(String digit) {
    if (_pin.length < widget.length) {
      setState(() {
        _pin.write(digit);
      });
      if (_pin.length == widget.length) {
        widget.onComplete(_pin.toString());
      }
    }
  }

  void _removeDigit() {
    if (_pin.isNotEmpty) {
      setState(() {
        _pin.writeCharCode(_pin.toString().codeUnitAt(_pin.length - 1));
        _pin.clear();
        _pin.write(_pin.toString().substring(0, _pin.length - 1));
      });
    }
  }

  void _clear() {
    setState(() {
      _pin.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final posTheme = theme.extension<PosThemeExtension>()!;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // PIN Display
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(
            color: posTheme.keyboardBackground,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(widget.length, (index) {
              final isFilled = index < _pin.length;
              return Container(
                width: 24,
                height: 24,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isFilled
                      ? theme.colorScheme.primary
                      : theme.colorScheme.outlineVariant,
                  border: Border.all(
                    color: isFilled
                        ? theme.colorScheme.primary
                        : theme.colorScheme.outline,
                    width: 2,
                  ),
                ),
                child: isFilled
                    ? const Icon(
                        Icons.circle,
                        size: 12,
                        color: Colors.white,
                      )
                    : null,
              );
            }),
          ),
        ),

        // Keypad
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          childAspectRatio: 1.5,
          padding: const EdgeInsets.all(16),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            _KeypadButton('1', onTap: () => _addDigit('1')),
            _KeypadButton('2', onTap: () => _addDigit('2')),
            _KeypadButton('3', onTap: () => _addDigit('3')),
            _KeypadButton('4', onTap: () => _addDigit('4')),
            _KeypadButton('5', onTap: () => _addDigit('5')),
            _KeypadButton('6', onTap: () => _addDigit('6')),
            _KeypadButton('7', onTap: () => _addDigit('7')),
            _KeypadButton('8', onTap: () => _addDigit('8')),
            _KeypadButton('9', onTap: () => _addDigit('9')),
            _KeypadButton(
              '⌫',
              onTap: _removeDigit,
              icon: Icons.backspace_outlined,
              isAction: true,
            ),
            _KeypadButton('0', onTap: () => _addDigit('0')),
            _KeypadButton(
              'Clear',
              onTap: _clear,
              isAction: true,
            ),
          ],
        ),
      ],
    );
  }
}

class _KeypadButton extends StatelessWidget {
  const _KeypadButton(
    this.label, {
    required this.onTap,
    this.icon,
    this.isAction = false,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool isAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final posTheme = theme.extension<PosThemeExtension>()!;

    return Material(
      color: isAction ? posTheme.keyboardKeyBackground : posTheme.keyboardKeyBackground,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Center(
            child: icon != null
                ? Icon(icon, size: 28, color: theme.colorScheme.onSurface)
                : Text(
                    label,
                    style: theme.textTheme.displaySmall?.copyWith(
                      color: isAction
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}