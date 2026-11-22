/// Receipt printer abstraction for hardware independence.
///
/// Implementations: `BluetoothReceiptPrinterService` (production) and
/// `MockReceiptPrinterService` (tests, emulator, desktop).

import '../../core/database/daos/sales_dao.dart';
import '../../core/utils/currency.dart';

/// Line to be printed on the receipt.
class ReceiptLine {
  const ReceiptLine({
    required this.text,
    this.bold = false,
    this.align = ReceiptAlign.left,
    this.fontSize = ReceiptFontSize.normal,
  });

  final String text;
  final bool bold;
  final ReceiptAlign align;
  final ReceiptFontSize fontSize;
}

enum ReceiptAlign { left, center, right }
enum ReceiptFontSize { small, normal, large }

/// Complete receipt content.
class ReceiptContent {
  const ReceiptContent({
    required this.lines,
    this.cutPaper = true,
    this.openCashDrawer = false,
  });

  final List<ReceiptLine> lines;
  final bool cutPaper;
  final bool openCashDrawer;
}

/// Printer service interface.
abstract interface class ReceiptPrinterService {
  /// Prints a receipt. Throws on failure.
  Future<void> printReceipt(ReceiptContent content);

  /// Opens the cash drawer (if supported).
  Future<void> openCashDrawer();

  /// Checks if a printer is connected/available.
  Future<bool> isAvailable();
}

/// Mock printer for tests and emulator — captures the last printed content.
class MockReceiptPrinterService implements ReceiptPrinterService {
  MockReceiptPrinterService();

  ReceiptContent? lastPrinted;
  bool _available = true;

  @override
  Future<void> printReceipt(ReceiptContent content) async {
    await Future.delayed(const Duration(milliseconds: 50));
    if (!_available) throw Exception('Printer not available');
    lastPrinted = content;
  }

  @override
  Future<void> openCashDrawer() async {
    await Future.delayed(const Duration(milliseconds: 10));
    if (!_available) throw Exception('Printer not available');
  }

  @override
  Future<bool> isAvailable() async => _available;

  /// Test helper: simulate printer offline.
  void setAvailable(bool available) => _available = available;

  void clear() => lastPrinted = null;
}

/// Builds a standard sale receipt from a SaleWithItems.
ReceiptContent buildSaleReceipt(
  SaleWithItems sale,
  String storeName,
  String storeCode,
  String cashierName,
) {
  final lines = <ReceiptLine>[
    ReceiptLine(text: storeName, bold: true, align: ReceiptAlign.center, fontSize: ReceiptFontSize.large),
    ReceiptLine(text: storeCode, align: ReceiptAlign.center),
    ReceiptLine(text: 'Cashier: $cashierName', align: ReceiptAlign.center),
    ReceiptLine(text: 'Receipt: ${sale.sale.receiptNo}', align: ReceiptAlign.center),
    ReceiptLine(text: sale.sale.createdAt.toLocal().toString().substring(0, 19), align: ReceiptAlign.center),
    const ReceiptLine(text: '--------------------------------'),
  ];

  for (final item in sale.items) {
    final nameLine = item.productNameSnapshot;
    final qtyPrice = '${item.qty} x ${formatIdr(item.unitPrice, showSymbol: false)}';
    lines.add(ReceiptLine(text: nameLine));
    lines.add(ReceiptLine(text: '$qtyPrice = ${formatIdr(item.lineTotal)}', align: ReceiptAlign.right));
    if (item.discountAmount > 0) {
      lines.add(ReceiptLine(text: '  Discount: -${formatIdr(item.discountAmount)}', align: ReceiptAlign.right));
    }
    if (item.taxAmount > 0) {
      lines.add(ReceiptLine(text: '  Tax: ${formatIdr(item.taxAmount)}', align: ReceiptAlign.right));
    }
  }

  lines.add(const ReceiptLine(text: '--------------------------------'));
  lines.add(ReceiptLine(text: 'Subtotal', align: ReceiptAlign.left));
  lines.add(ReceiptLine(text: formatIdr(sale.sale.subtotal), align: ReceiptAlign.right));
  if (sale.sale.discountTotal > 0) {
    lines.add(ReceiptLine(text: 'Discount', align: ReceiptAlign.left));
    lines.add(ReceiptLine(text: '-${formatIdr(sale.sale.discountTotal)}', align: ReceiptAlign.right));
  }
  lines.add(ReceiptLine(text: 'Tax', align: ReceiptAlign.left));
  lines.add(ReceiptLine(text: formatIdr(sale.sale.taxTotal), align: ReceiptAlign.right));
  lines.add(const ReceiptLine(text: '================================', align: ReceiptAlign.center));
  lines.add(ReceiptLine(text: 'TOTAL', bold: true, align: ReceiptAlign.left, fontSize: ReceiptFontSize.large));
  lines.add(ReceiptLine(text: formatIdr(sale.sale.grandTotal), bold: true, align: ReceiptAlign.right, fontSize: ReceiptFontSize.large));
  lines.add(const ReceiptLine(text: '================================', align: ReceiptAlign.center));
  lines.add(ReceiptLine(text: 'Payment: ${sale.sale.paymentMethod.name.toUpperCase()}', align: ReceiptAlign.center));
  lines.add(const ReceiptLine(text: 'Thank you for your purchase!', align: ReceiptAlign.center, fontSize: ReceiptFontSize.small));

  return ReceiptContent(lines: lines);
}