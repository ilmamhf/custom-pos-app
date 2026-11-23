/// Shift management screen - open/close shift.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/currency.dart';
import '../../features/auth/auth_provider.dart';
import '../sync/sync_provider.dart';
import 'shift_provider.dart';

/// Main shift screen - shows open shift or open/close shift actions.
class ShiftScreen extends ConsumerWidget {
  const ShiftScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final shiftState = ref.watch(shiftProvider);
    final theme = Theme.of(context);

    final store = authState.selectedStore;
    if (store == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Shift')),
        body: const Center(child: Text('No store selected')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shift Management'),
        actions: [
          IconButton(
            icon: const Icon(Icons.store),
            onPressed: () => context.go('/store-selector'),
            tooltip: 'Change Store',
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Store Info
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(
                      Icons.store,
                      size: 32,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            store.name,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'Code: ${store.code} | Tax: ${formatBpsPercent(store.taxRateBps)}%',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Shift Status
            if (shiftState.isOpen) ...[
              _ActiveShiftCard(shift: shiftState),
              const SizedBox(height: 24),
              // Close Shift Button
              FilledButton.icon(
                onPressed: shiftState.isClosing
                    ? null
                    : () => _showCloseShiftDialog(context, ref),
                icon: shiftState.isClosing
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.lock_clock),
                label:
                    Text(shiftState.isClosing ? 'Closing...' : 'Close Shift'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: theme.colorScheme.error,
                ),
              ),
            ] else ...[
              // No active shift - show Open Shift
              _OpenShiftCard(
                  onOpenShift: () => _showOpenShiftDialog(context, ref)),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _showOpenShiftDialog(BuildContext context, WidgetRef ref) async {
    final openingCashController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Open Shift'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Enter opening cash amount',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: openingCashController,
                decoration: const InputDecoration(
                  labelText: 'Opening Cash (IDR)',
                  hintText: 'e.g., 500000',
                  prefixIcon: Icon(Icons.attach_money),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter opening cash';
                  }
                  final amount =
                      int.tryParse(value.replaceAll(RegExp(r'[^\d]'), ''));
                  if (amount == null || amount < 0) {
                    return 'Enter a valid amount';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final amount = int.parse(
                  openingCashController.text.replaceAll(RegExp(r'[^\d]'), ''));
              Navigator.of(context).pop();
              await ref.read(shiftProvider.notifier).openShift(
                    amount,
                    syncToServer: !ref.read(authProvider).isDemo,
                  );
              if (!ref.read(authProvider).isDemo) {
                unawaited(ref.read(syncProvider.notifier).requestSync());
              }
              if (!context.mounted) return;
              final error = ref.read(shiftProvider).error;
              if (error != null) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(error)),
                );
              }
            },
            child: const Text('Open Shift'),
          ),
        ],
      ),
    );
  }

  Future<void> _showCloseShiftDialog(
      BuildContext context, WidgetRef ref) async {
    final theme = Theme.of(context);
    final actualCashController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final shift = ref.read(shiftProvider);
    final expectedCash = shift.expectedCash ?? shift.openingCash;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Close Shift'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Expected Cash: ${formatCurrency(expectedCash ?? 0)}',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: actualCashController,
                decoration: const InputDecoration(
                  labelText: 'Actual Cash Counted (IDR)',
                  hintText: 'e.g., 1250000',
                  prefixIcon: Icon(Icons.attach_money),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter actual cash';
                  }
                  final amount =
                      int.tryParse(value.replaceAll(RegExp(r'[^\d]'), ''));
                  if (amount == null || amount < 0) {
                    return 'Enter a valid amount';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final amount = int.parse(
                  actualCashController.text.replaceAll(RegExp(r'[^\d]'), ''));
              Navigator.of(context).pop();
              await ref.read(shiftProvider.notifier).closeShift(
                    actualCash: amount,
                    syncToServer: !ref.read(authProvider).isDemo,
                  );
              if (!ref.read(authProvider).isDemo) {
                unawaited(ref.read(syncProvider.notifier).requestSync());
              }
              if (!context.mounted) return;
              final state = ref.read(shiftProvider);
              final message = state.error ??
                  'Shift closed. Variance: ${formatCurrency(state.variance ?? 0)}';
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(message)),
              );
            },
            style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error),
            child: const Text('Close Shift'),
          ),
        ],
      ),
    );
  }
}

/// Card showing active shift info.
class _ActiveShiftCard extends StatelessWidget {
  const _ActiveShiftCard({required this.shift});

  final ShiftState shift;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final expectedCash = shift.expectedCash ?? shift.openingCash;
    final variance = shift.variance ?? 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.receipt_long,
                    color: theme.colorScheme.onPrimaryContainer,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Active Shift',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Opened: ${_formatDateTime(shift.openedAt!)}',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'OPEN',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Divider(),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ShiftInfoTile(
                    label: 'Opening Cash',
                    value: formatCurrency(shift.openingCash!),
                    icon: Icons.monetization_on,
                  ),
                ),
                Expanded(
                  child: _ShiftInfoTile(
                    label: 'Expected Cash',
                    value: formatCurrency(expectedCash ?? 0),
                    icon: Icons.calculate,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (variance != 0)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: variance > 0
                      ? theme.colorScheme.errorContainer
                      : theme.colorScheme.secondaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(
                      variance > 0 ? Icons.warning : Icons.check_circle,
                      color: variance > 0
                          ? theme.colorScheme.onErrorContainer
                          : theme.colorScheme.onSecondaryContainer,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        variance > 0
                            ? 'Cash Over: ${formatCurrency(variance.abs())}'
                            : 'Cash Short: ${formatCurrency(variance.abs())}',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: variance > 0
                              ? theme.colorScheme.onErrorContainer
                              : theme.colorScheme.onSecondaryContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

/// Card for opening new shift.
class _OpenShiftCard extends StatelessWidget {
  const _OpenShiftCard({required this.onOpenShift});

  final VoidCallback onOpenShift;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.lock_open,
                size: 48,
                color: theme.colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'No Active Shift',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Start a new shift by entering opening cash amount',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onOpenShift,
              icon: const Icon(Icons.add),
              label: const Text('Open New Shift'),
              style: FilledButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Info tile for shift details.
class _ShiftInfoTile extends StatelessWidget {
  const _ShiftInfoTile({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Icon(icon, size: 24, color: theme.colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
