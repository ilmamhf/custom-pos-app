/// POS checkout screen: product grid/search on the left, cart on the right.
///
/// The screen works entirely against the local database; checkout never waits
/// for the network.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/database/database_provider.dart';
import '../../core/database/tables/local_products.dart';
import '../../core/database/tables/local_sales.dart';
import '../../core/utils/currency.dart';
import '../auth/auth_provider.dart';
import '../catalog/catalog_provider.dart';
import '../shift/shift_provider.dart';
import 'cart_math.dart';
import 'cart_provider.dart';
import 'payment_dialog.dart';

class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  String _shortId(String? id) {
    if (id == null) return '—';
    return id.length <= 8 ? id : id.substring(0, 8);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  /// A submitted scan/text is matched exactly against barcode and SKU first so
  /// a barcode reader adds the product immediately.
  Future<void> _submitSearch(String value) async {
    final query = value.trim();
    if (query.isEmpty) return;

    final db = ref.read(databaseProvider);
    final product = await db.productsDao.getProductByBarcode(query) ??
        await db.productsDao.getProductBySku(query);

    if (!mounted) return;
    if (product != null && product.isActive) {
      ref.read(cartProvider.notifier).addProduct(product);
      _searchController.clear();
      ref.read(productQueryProvider.notifier).state = '';
    } else {
      ref.read(productQueryProvider.notifier).state = query;
    }
    _searchFocus.requestFocus();
  }

  Future<void> _checkout() async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;

    final result = await showPaymentDialog(
      context,
      grandTotal: cart.grandTotal,
      taxRateBps: cart.taxRateBps,
    );
    if (!mounted || result == null) return;

    await showDialog<void>(
      context: context,
      builder: (context) => _SaleCompleteDialog(result: result),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(shiftAuthProvider);
    final shift = ref.watch(shiftProvider);
    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(auth.selectedStore?.name ?? 'POS'),
            Text(
              'Shift ${_shortId(shift.id)} • '
              'Cashier ${auth.user?.name ?? '—'}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.lock_clock),
            tooltip: 'Shift',
            onPressed: () => context.go('/shift'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 900;
          if (wide) {
            return Row(
              children: [
                Expanded(
                  child: _CatalogPane(
                    searchController: _searchController,
                    searchFocus: _searchFocus,
                    onSubmitted: _submitSearch,
                  ),
                ),
                const VerticalDivider(width: 1),
                SizedBox(
                  width: 400,
                  child: _CartPanel(onCheckout: _checkout),
                ),
              ],
            );
          }
          return _CatalogPane(
            searchController: _searchController,
            searchFocus: _searchFocus,
            onSubmitted: _submitSearch,
          );
        },
      ),
      bottomNavigationBar: MediaQuery.sizeOf(context).width < 900
          ? _CartBar(
              cart: cart,
              onTap: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (context) => FractionallySizedBox(
                  heightFactor: 0.85,
                  child: _CartPanel(
                    onCheckout: () {
                      Navigator.of(context).pop();
                      _checkout();
                    },
                  ),
                ),
              ),
            )
          : null,
    );
  }
}

class _CatalogPane extends ConsumerWidget {
  const _CatalogPane({
    required this.searchController,
    required this.searchFocus,
    required this.onSubmitted,
  });

  final TextEditingController searchController;
  final FocusNode searchFocus;
  final ValueChanged<String> onSubmitted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(catalogProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: TextField(
            controller: searchController,
            focusNode: searchFocus,
            autofocus: true,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Scan barcode or search products',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                icon: const Icon(Icons.clear),
                tooltip: 'Clear',
                onPressed: () {
                  searchController.clear();
                  ref.read(productQueryProvider.notifier).state = '';
                  searchFocus.requestFocus();
                },
              ),
            ),
            onChanged: (value) =>
                ref.read(productQueryProvider.notifier).state = value,
            onSubmitted: onSubmitted,
          ),
        ),
        Expanded(
          child: products.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Could not load products: $error'),
              ),
            ),
            data: (items) {
              if (items.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.inventory_2_outlined,
                        size: 64,
                        color: Theme.of(context).colorScheme.outline,
                      ),
                      const SizedBox(height: 12),
                      const Text('No products found'),
                      const SizedBox(height: 4),
                      Text(
                        'Sync the catalog or adjust the search.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                );
              }
              return GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                gridDelegate:
                    const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 240,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.15,
                ),
                itemCount: items.length,
                itemBuilder: (context, index) => _ProductCard(
                  product: items[index],
                  onTap: () =>
                      ref.read(cartProvider.notifier).addProduct(items[index]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.onTap});

  final LocalProduct product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final outOfStock = product.stockOnHand <= 0;
    final lowStock = product.stockOnHand <= 5;
    final stockColor = outOfStock
        ? theme.colorScheme.error
        : lowStock
            ? theme.colorScheme.tertiary
            : theme.colorScheme.onSurfaceVariant;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: stockColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      outOfStock ? 'Out' : '${product.stockOnHand}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: stockColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                product.sku,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const Spacer(),
              Text(
                formatIdr(product.effectivePrice),
                style: theme.textTheme.titleLarge?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartPanel extends ConsumerWidget {
  const _CartPanel({required this.onCheckout});

  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
          child: Row(
            children: [
              Text(
                'Cart',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 8),
              if (cart.itemCount > 0)
                Chip(
                  label: Text('${cart.itemCount}'),
                  visualDensity: VisualDensity.compact,
                ),
              const Spacer(),
              TextButton.icon(
                onPressed:
                    cart.isEmpty ? null : ref.read(cartProvider.notifier).clear,
                icon: const Icon(Icons.delete_sweep_outlined),
                label: const Text('Clear'),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: cart.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.shopping_cart_outlined,
                        size: 56,
                        color: theme.colorScheme.outline,
                      ),
                      const SizedBox(height: 12),
                      const Text('Cart is empty'),
                      const SizedBox(height: 4),
                      Text(
                        'Scan a barcode or tap a product.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: cart.lines.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final line = cart.lines[index];
                    return _CartLineTile(
                      line: line,
                      onIncrement: () => ref
                          .read(cartProvider.notifier)
                          .increment(line.productId),
                      onDecrement: () => ref
                          .read(cartProvider.notifier)
                          .decrement(line.productId),
                      onRemove: () =>
                          ref.read(cartProvider.notifier).remove(line.productId),
                      onDiscount: () =>
                          _showItemDiscountDialog(context, ref, line),
                    );
                  },
                ),
        ),
        const Divider(height: 1),
        _CartTotals(cart: cart, onCheckout: onCheckout),
      ],
    );
  }

  Future<void> _showItemDiscountDialog(
    BuildContext context,
    WidgetRef ref,
    CartLine line,
  ) async {
    final controller = TextEditingController(
      text: line.itemDiscount == 0 ? '' : line.itemDiscount.toString(),
    );
    final amount = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Discount • ${line.name}'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Discount amount (IDR)',
            prefixText: 'Rp ',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(context).pop(parseIdr(controller.text)),
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    if (amount != null) {
      ref.read(cartProvider.notifier).setItemDiscount(line.productId, amount);
    }
  }
}

class _CartLineTile extends StatelessWidget {
  const _CartLineTile({
    required this.line,
    required this.onIncrement,
    required this.onDecrement,
    required this.onRemove,
    required this.onDiscount,
  });

  final CartLine line;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;
  final VoidCallback onRemove;
  final VoidCallback onDiscount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasDiscount = line.itemDiscount > 0;

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
                    Text(
                      line.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      formatIdr(line.unitPrice),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.percent, size: 18),
                tooltip: 'Item discount',
                visualDensity: VisualDensity.compact,
                onPressed: onDiscount,
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 18),
                tooltip: 'Remove',
                visualDensity: VisualDensity.compact,
                onPressed: onRemove,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              _QtyButton(icon: Icons.remove, onPressed: onDecrement),
              SizedBox(
                width: 40,
                child: Text(
                  '${line.qty}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
              ),
              _QtyButton(icon: Icons.add, onPressed: onIncrement),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (hasDiscount)
                    Text(
                      formatIdr(line.gross),
                      style: theme.textTheme.bodySmall?.copyWith(
                        decoration: TextDecoration.lineThrough,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  Text(
                    formatIdr(line.net),
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: Icon(icon, size: 20),
      ),
    );
  }
}

class _CartTotals extends ConsumerWidget {
  const _CartTotals({required this.cart, required this.onCheckout});

  final CartState cart;
  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TotalRow(label: 'Subtotal', amount: cart.subtotal),
          if (cart.itemDiscountTotal > 0)
            _TotalRow(
              label: 'Item discounts',
              amount: -cart.itemDiscountTotal,
            ),
          _TotalRow(
            label: 'Order discount',
            amount: -cart.orderDiscountAmount,
            trailing: TextButton(
              onPressed: cart.isEmpty
                  ? null
                  : () => _showOrderDiscountDialog(context, ref, cart),
              child: Text(
                cart.orderDiscountBps == 0
                    ? 'Add'
                    : '${formatBpsPercent(cart.orderDiscountBps)}%',
              ),
            ),
          ),
          _TotalRow(
            label: 'Tax ${formatBpsPercent(cart.taxRateBps)}%',
            amount: cart.taxTotal,
          ),
          const Divider(height: 24),
          Row(
            children: [
              Text(
                'Total',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    formatIdr(cart.grandTotal),
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 56,
            child: FilledButton.icon(
              onPressed: cart.isEmpty ? null : onCheckout,
              icon: const Icon(Icons.point_of_sale),
              label: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  cart.isEmpty
                      ? 'Add items to charge'
                      : 'Charge ${formatIdr(cart.grandTotal)}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showOrderDiscountDialog(
    BuildContext context,
    WidgetRef ref,
    CartState cart,
  ) async {
    final controller = TextEditingController(
      text: cart.orderDiscountBps == 0
          ? ''
          : (cart.orderDiscountBps ~/ 100).toString(),
    );
    final percent = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Order discount'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Discount percent',
                suffixText: '%',
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final value in [0, 5, 10, 20])
                  ActionChip(
                    label: Text('$value%'),
                    onPressed: () {
                      controller.text = value.toString();
                    },
                  ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(context).pop(int.tryParse(controller.text) ?? 0),
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    if (percent != null) {
      ref.read(cartProvider.notifier).setOrderDiscountBps(percent * 100);
    }
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({required this.label, required this.amount, this.trailing});

  final String label;
  final int amount;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
          if (trailing != null) trailing!,
          Text(
            formatIdr(amount),
            style: theme.textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart, required this.onTap});

  final CartState cart;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Material(
        color: theme.colorScheme.primaryContainer,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(
              children: [
                Badge(
                  label: Text('${cart.itemCount}'),
                  isLabelVisible: cart.itemCount > 0,
                  child: const Icon(Icons.shopping_cart),
                ),
                const SizedBox(width: 16),
                Text(
                  'View cart',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
                const Spacer(),
                Text(
                  formatIdr(cart.grandTotal),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SaleCompleteDialog extends StatelessWidget {
  const _SaleCompleteDialog({required this.result});

  final PaymentResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      icon: Icon(
        Icons.check_circle,
        color: theme.colorScheme.primary,
        size: 48,
      ),
      title: const Text('Sale complete'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Receipt ${result.sale.receiptNo}',
              style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text('Paid with ${result.method.name.toUpperCase()}'),
          if (result.method == PaymentMethod.cash) ...[
            const SizedBox(height: 8),
            Text('Change ${formatIdr(result.change)}'),
          ],
        ],
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('New sale'),
        ),
      ],
    );
  }
}
