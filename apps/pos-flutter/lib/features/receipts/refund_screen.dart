/// Refund screen: item-level refund with Manager PIN verification.
///
/// Flow:
/// 1. Load the original sale by ID.
/// 2. Show items that can be refunded (qty > refunded_qty).
/// 3. For each item, enter refund quantity.
/// 4. On confirm, verify Manager PIN (online with offline fallback).
/// 5. Locally: increment stock, increment refunded_qty, update sale status.
/// 6. Enqueue `SYNC_REFUND` outbox entry (future Phase 5+).

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/daos/sales_dao.dart';
import '../../core/utils/currency.dart';
import '../../core/utils/uuid_helper.dart';
import '../auth/pin_dialog.dart';
import '../shift/shift_provider.dart';
import '../sync/sync_provider.dart';

class RefundScreen extends ConsumerStatefulWidget {
  const RefundScreen({super.key, required this.saleId});

  final String saleId;

  @override
  ConsumerState<RefundScreen> createState() => _RefundScreenState();
}

class _RefundScreenState extends ConsumerState<RefundScreen> {
  SaleWithItems? _sale;
  final _refundQty = <String, int>{};
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSale();
  }

  Future<void> _loadSale() async {
    final db = ref.read(databaseProvider);
    final sale = await db.salesDao.getSaleWithItems(widget.saleId);
    if (!mounted) return;
    if (sale == null) {
      setState(() {
        _isLoading = false;
        _error = 'Sale not found';
      });
      return;
    }
    setState(() {
      _sale = sale;
      _isLoading = false;
    });
  }

  int get _totalRefundAmount {
    var total = 0;
    for (final entry in _refundQty.entries) {
      final item = _sale!.items.firstWhere((i) => i.id == entry.key);
      if (item.qty <= 0) continue;
      // Refund the exact proportional share of the immutable line total
      // (which already includes sale-time discount and tax).
      total += (item.lineTotal * entry.value) ~/ item.qty;
    }
    return total;
  }

  Future<void> _confirmRefund() async {
    if (_sale == null) return;
    if (_refundQty.values.every((q) => q == 0)) {
      setState(() => _error = 'Select at least one item to refund');
      return;
    }

    final verified = await showPinDialog(
      context,
      title: 'Manager Verification',
      message: 'Enter manager PIN to authorize this refund',
      storeId: ref.read(shiftAuthProvider).selectedStore?.id,
    );

    if (!mounted) return;
    if (verified == null || !verified.authorized) {
      setState(() => _error = 'Manager PIN verification required');
      return;
    }

    // The server accepts a signed grant as proof of authorization for a
    // queued refund; a bare local hash is not sufficient.
    final grant = verified.grant;
    if (grant == null || grant.isEmpty) {
      setState(() => _error =
          'Offline refund authorization unavailable. Reconnect and verify the PIN once.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final db = ref.read(databaseProvider);
      final auth = ref.read(shiftAuthProvider);
      final shift = ref.read(shiftProvider);
      final store = auth.selectedStore;
      final user = auth.user;

      if (store == null || user == null || shift.id == null) {
        throw Exception('Invalid session');
      }
      if (_sale!.sale.storeId != store.id) {
        throw Exception('Selected store does not own this sale');
      }

      final refundId = generateUuid();
      final createdAt = DateTime.now().toUtc();

      db.transaction(() {
        // Update sale items and stock
        for (final entry in _refundQty.entries) {
          final refundQty = entry.value;
          if (refundQty == 0) continue;

          final item = _sale!.items.firstWhere((i) => i.id == entry.key);

          // Increment refunded_qty
          db.execute('''
            UPDATE local_sale_items
            SET refunded_qty = refunded_qty + ?
            WHERE id = ?
          ''', [refundQty, entry.key]);

          // Increment stock, scoped to the store that owns this sale.
          db.execute('''
            UPDATE local_products
            SET stock_on_hand = stock_on_hand + ?
            WHERE store_id = ? AND id = ?
          ''', [refundQty, _sale!.sale.storeId, item.productId]);
        }

        // Update sale status
        final allRefunded = _sale!.items.every((i) =>
            i.refundedQty + (_refundQty[i.id] ?? 0) >= i.qty);
        final newStatus = allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        db.execute('''
          UPDATE local_sales
          SET status = ?
          WHERE id = ?
        ''', [newStatus, _sale!.sale.id]);

        // Enqueue a first-class refund command with a signed authorization
        // grant and a stable command id used as the idempotency key.
        final payload = jsonEncode({
          'storeId': _sale!.sale.storeId,
          'shifts': <Object>[],
          'sales': <Object>[],
          'refunds': [
            {
              'id': refundId,
              'saleId': _sale!.sale.id,
              'authorizationToken': grant,
              'reason': 'Offline refund from POS',
              'items': [
                for (final entry in _refundQty.entries)
                  if (entry.value > 0)
                    {
                      'saleItemId': entry.key,
                      'refundQty': entry.value,
                    }
              ],
              'createdAt': createdAt.toIso8601String(),
            }
          ],
        });

        db.execute('''
          INSERT INTO sync_outbox
          (entity_id, entity_type, operation, payload, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        ''', [
          refundId,
          'refund',
          'createRefund',
          payload,
          'PENDING',
          createdAt.millisecondsSinceEpoch,
        ]);
      });
      await db.flush();

      // Push the refund command immediately when the session is online.
      unawaited(ref.read(syncProvider.notifier).requestSync());

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Refund processed: ${formatIdr(_totalRefundAmount)}')),
      );
      context.go('/pos');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = 'Refund failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Refund'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/pos'),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _sale == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error ?? 'Sale not found'),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Receipt: ${_sale!.sale.receiptNo}',
                                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              Text('Date: ${_sale!.sale.createdAt.toLocal().toString().substring(0, 19)}'),
                              Text('Original Total: ${formatIdr(_sale!.sale.grandTotal)}'),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: ListView.separated(
                          itemCount: _sale!.items.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final item = _sale!.items[index];
                            final maxQty = item.qty - item.refundedQty;
                            final currentRefund = _refundQty[item.id] ?? 0;

                            if (maxQty <= 0) {
                              return ListTile(
                                title: Text(item.productNameSnapshot),
                                subtitle: Text('Fully refunded (${item.refundedQty}/${item.qty})'),
                                trailing: const Icon(Icons.check_circle, color: Colors.green),
                              );
                            }

                            return Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(item.productNameSnapshot, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                                            Text('${formatIdr(item.unitPrice)} x ${item.qty}', style: theme.textTheme.bodySmall),
                                          ],
                                        ),
                                      ),
                                      Text(formatIdr(item.unitPrice * currentRefund), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: theme.colorScheme.error)),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Text('Refund qty: '),
                                      Expanded(
                                        child: Slider(
                                          value: currentRefund.toDouble(),
                                          min: 0,
                                          max: maxQty.toDouble(),
                                          divisions: maxQty,
                                          label: currentRefund.toString(),
                                          onChanged: (value) {
                                            setState(() {
                                              _refundQty[item.id] = value.round();
                                            });
                                          },
                                        ),
                                      ),
                                      SizedBox(
                                        width: 40,
                                        child: Text('$currentRefund / $maxQty', textAlign: TextAlign.end),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(_error!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error)),
                        ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _isLoading ? null : () => context.go('/pos'),
                              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                              child: const Text('Cancel'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: FilledButton(
                              onPressed: _isLoading || _totalRefundAmount == 0 ? null : _confirmRefund,
                              style: FilledButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                backgroundColor: theme.colorScheme.error,
                              ),
                              child: _isLoading
                                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : Text('Refund ${formatIdr(_totalRefundAmount)}'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
    );
  }
}