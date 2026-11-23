import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/database/tables/local_products.dart';
import 'package:pos_flutter/features/pos/cart_provider.dart';

LocalProduct product(String id, {int price = 18000, String name = 'Kopi'}) {
  return LocalProduct(
    id: id,
    sku: id,
    name: name,
    effectivePrice: price,
    stockOnHand: 10,
    isActive: true,
    updatedAt: DateTime.utc(2026, 11, 20),
  );
}

void main() {
  late CartNotifier cart;

  setUp(() {
    cart = CartNotifier(taxRateBps: 1100);
  });

  test('adding the same product merges into one line', () {
    cart.addProduct(product('p1'));
    cart.addProduct(product('p1'));

    expect(cart.state.lines, hasLength(1));
    expect(cart.state.lines.single.qty, 2);
    expect(cart.state.subtotal, 36000);
  });

  test('increment and decrement adjust quantity', () {
    cart.addProduct(product('p1'));
    cart.increment('p1');
    expect(cart.state.lines.single.qty, 2);

    cart.decrement('p1');
    expect(cart.state.lines.single.qty, 1);
  });

  test('decrementing the last unit removes the line', () {
    cart.addProduct(product('p1'));
    cart.decrement('p1');

    expect(cart.state.isEmpty, isTrue);
  });

  test('setQty to zero removes the line', () {
    cart.addProduct(product('p1'));
    cart.setQty('p1', 0);

    expect(cart.state.isEmpty, isTrue);
  });

  test('item discount is clamped to the line gross', () {
    cart.addProduct(product('p1'));
    cart.setItemDiscount('p1', 999999);

    expect(cart.state.lines.single.itemDiscount, 18000);
    expect(cart.state.lines.single.net, 0);
  });

  test('negative item discount becomes zero', () {
    cart.addProduct(product('p1'));
    cart.setItemDiscount('p1', -500);

    expect(cart.state.lines.single.itemDiscount, 0);
  });

  test('order discount is clamped to 100%', () {
    cart.addProduct(product('p1'));
    cart.setOrderDiscountBps(20000);

    expect(cart.state.orderDiscountBps, 10000);
  });

  test('clear empties lines but keeps the tax rate', () {
    cart.addProduct(product('p1'));
    cart.clear();

    expect(cart.state.isEmpty, isTrue);
    expect(cart.state.taxRateBps, 1100);
  });

  test('applyPrices adopts the synced price and clamps the item discount', () {
    cart.addProduct(product('p1', price: 18000));
    cart.setItemDiscount('p1', 15000);
    expect(cart.state.lines.single.itemDiscount, 15000);

    cart.applyPrices({'p1': 12000});

    final line = cart.state.lines.single;
    expect(line.unitPrice, 12000);
    expect(line.itemDiscount, 12000);
    expect(line.net, 0);
  });

  test('applyPrices ignores products that are not in the cart or unchanged', () {
    cart.addProduct(product('p1', price: 18000));

    cart.applyPrices({'p2': 5000});
    expect(cart.state.lines.single.unitPrice, 18000);

    cart.applyPrices({'p1': 18000});
    expect(cart.state.lines.single.unitPrice, 18000);
  });

  test('remove deletes only the requested line', () {
    cart.addProduct(product('p1'));
    cart.addProduct(product('p2', name: 'Roti'));
    cart.remove('p1');

    expect(cart.state.lines, hasLength(1));
    expect(cart.state.lines.single.productId, 'p2');
  });
}
