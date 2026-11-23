import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/router/app_router.dart';

void main() {
  String? redirect({
    required bool loggedIn,
    required bool hasStore,
    required bool hasShift,
    required String location,
  }) {
    return resolveRedirect(
      isLoggedIn: loggedIn,
      hasStore: hasStore,
      hasOpenShift: hasShift,
      location: location,
    );
  }

  group('resolveRedirect', () {
    test('sends anonymous users to login from any guarded route', () {
      expect(
        redirect(loggedIn: false, hasStore: false, hasShift: false, location: '/pos'),
        '/login',
      );
      expect(
        redirect(loggedIn: false, hasStore: false, hasShift: false, location: '/shift'),
        '/login',
      );
    });

    test('keeps anonymous users on login', () {
      expect(
        redirect(loggedIn: false, hasStore: false, hasShift: false, location: '/login'),
        isNull,
      );
    });

    test('requires store selection after login', () {
      expect(
        redirect(loggedIn: true, hasStore: false, hasShift: false, location: '/login'),
        '/store-selector',
      );
      expect(
        redirect(loggedIn: true, hasStore: false, hasShift: false, location: '/pos'),
        '/store-selector',
      );
      expect(
        redirect(
          loggedIn: true,
          hasStore: false,
          hasShift: false,
          location: '/store-selector',
        ),
        isNull,
      );
    });

    test('requires an open shift before POS', () {
      expect(
        redirect(loggedIn: true, hasStore: true, hasShift: false, location: '/pos'),
        '/shift',
      );
      expect(
        redirect(loggedIn: true, hasStore: true, hasShift: false, location: '/store-selector'),
        '/shift',
      );
      expect(
        redirect(loggedIn: true, hasStore: true, hasShift: false, location: '/shift'),
        isNull,
      );
    });

    test('moves a fully ready cashier from pre-POS screens to POS', () {
      for (final location in ['/login', '/store-selector']) {
        expect(
          redirect(loggedIn: true, hasStore: true, hasShift: true, location: location),
          '/pos',
          reason: 'location $location',
        );
      }

      // Shift Management hosts Close Shift, so it must remain reachable.
      expect(
        redirect(loggedIn: true, hasStore: true, hasShift: true, location: '/shift'),
        isNull,
      );
    });

    test('allows the POS, shift, and refund routes once a shift is open', () {
      for (final location in ['/pos', '/shift', '/refund/sale-1']) {
        expect(
          redirect(loggedIn: true, hasStore: true, hasShift: true, location: location),
          isNull,
          reason: 'location $location',
        );
      }
    });
  });
}
