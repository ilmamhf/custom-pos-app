/// Payment dialog: choose method, enter cash, complete the offline sale.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/database/daos/sales_dao.dart';
import '../../core/database/tables/local_sales.dart';
import '../../core/utils/currency.dart';
import '../catalog/catalog_provider.dart';
import '../shift/shift_provider.dart';
import '../sync/sync_provider.dart';
import 'cart_math.dart';
import 'cart_provider.dart';
import 'checkout_service.dart';

/// Outcome of a completed payment.
class PaymentResult {
  const PaymentResult({
    required this.sale,
    required this.method,
    required this.tendered,
    required this.change,
  });

  final SaleCheckoutResult sale;
  final PaymentMethod method;
  final int tendered;
  final int change;
}

/// Opens the payment dialog and returns the result, or null when cancelled.
Future<PaymentResult?> showPaymentDialog(
  BuildContext context, {
  required int grandTotal,
  required int taxRateBps,
}) {
  return showDialog<PaymentResult>(
    context: context,
    barrierDismissible: false,
    builder: (_) => PaymentDialog(
      grandTotal: grandTotal,
      taxRateBps: taxRateBps,
    ),
  );
}

class PaymentDialog extends ConsumerStatefulWidget {
  const PaymentDialog({
    super.key,
    required this.grandTotal,
    required this.taxRateBps,
  });

  final int grandTotal;
  final int taxRateBps;

  @override
  ConsumerState<PaymentDialog> createState() => _PaymentDialogState();
}

class _PaymentDialogState extends ConsumerState<PaymentDialog> {
  final _cashController = TextEditingController();
  PaymentMethod _method = PaymentMethod.cash;
  bool _isProcessing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cashController.text = widget.grandTotal.toString();
  }

  @override
  void dispose() {
    _cashController.dispose();
    super.dispose();
  }

  int get _tendered {
    if (_method != PaymentMethod.cash) return widget.grandTotal;
    return parseIdr(_cashController.text);
  }

  int get _change => calculateChange(_tendered, widget.grandTotal);

  bool get _canConfirm =>
      !_isProcessing &&
      (_method != PaymentMethod.cash || _tendered >= widget.grandTotal);

  Future<void> _confirm() async {
    if (!_canConfirm) return;

    final auth = ref.read(shiftAuthProvider);
    final store = auth.selectedStore;
    final user = auth.user;
    final shift = ref.read(shiftProvider);
    if (store == null || user == null || !shift.isOpen || shift.id == null) {
      setState(() => _error = 'No open shift for this store');
      return;
    }

    setState(() {
      _isProcessing = true;
      _error = null;
    });

    try {
      final sale = await ref.read(checkoutServiceProvider).checkout(
            cart: ref.read(cartProvider),
            paymentMethod: _method,
            storeId: store.id,
            storeCode: store.code,
            shiftId: shift.id!,
            cashierId: user.id,
            amountTendered: _method == PaymentMethod.cash ? _tendered : null,
            syncToServer: !auth.isDemo,
          );

      ref.read(cartProvider.notifier).clear();
      ref.invalidate(catalogProvider);
      await ref.read(shiftProvider.notifier).refresh();

      // Push the new sale immediately instead of waiting for the 30s timer.
      unawaited(ref.read(syncProvider.notifier).requestSync());

      if (!mounted) return;
      Navigator.of(context).pop(
        PaymentResult(
          sale: sale,
          method: _method,
          tendered: _tendered,
          change: _change,
        ),
      );
    } on CheckoutException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _isProcessing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Checkout failed: $e';
        _isProcessing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final suggestions = suggestedCashAmounts(widget.grandTotal);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Payment',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    Text(
                      'Amount due',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                    Text(
                      formatIdr(widget.grandTotal),
                      style: theme.textTheme.displayMedium?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Tax ${formatBpsPercent(widget.taxRateBps)}%',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SegmentedButton<PaymentMethod>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(
                    value: PaymentMethod.cash,
                    label: Text('Cash'),
                  ),
                  ButtonSegment(
                    value: PaymentMethod.qris,
                    label: Text('QRIS'),
                  ),
                  ButtonSegment(
                    value: PaymentMethod.card,
                    label: Text('Card'),
                  ),
                ],
                selected: {_method},
                onSelectionChanged: _isProcessing
                    ? null
                    : (selection) {
                        setState(() {
                          _method = selection.first;
                          _error = null;
                        });
                      },
              ),
              const SizedBox(height: 20),
              if (_method == PaymentMethod.cash) ...[
                TextField(
                  controller: _cashController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'Cash received (IDR)',
                    prefixText: 'Rp ',
                    prefixIcon: Icon(Icons.payments),
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _confirm(),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final amount in suggestions)
                      ActionChip(
                        label: Text(formatIdr(amount, showSymbol: false)),
                        onPressed: _isProcessing
                            ? null
                            : () {
                                _cashController.text = amount.toString();
                                setState(() {});
                              },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Change', style: theme.textTheme.bodyLarge),
                    Text(
                      formatIdr(_change),
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: _tendered >= widget.grandTotal
                            ? theme.colorScheme.primary
                            : theme.colorScheme.error,
                      ),
                    ),
                  ],
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: theme.colorScheme.error),
                ),
              ],
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isProcessing
                          ? null
                          : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _canConfirm ? _confirm : null,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _isProcessing
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                'Complete Sale • ${formatIdr(widget.grandTotal)}',
                                maxLines: 1,
                              ),
                            ),
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
