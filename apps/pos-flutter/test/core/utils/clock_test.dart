/// Unit tests for clock abstraction utilities.

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/core/utils/clock.dart';

void main() {
  group('SystemClock', () {
    test('returns current UTC time', () {
      final clock = SystemClock();
      final now = clock.nowUtc;
      // Should be very close to actual now (within a few milliseconds)
      expect(now.difference(DateTime.now().toUtc()).inMilliseconds.abs(), lessThan(100));
    });

    test('returns current local time', () {
      final clock = SystemClock();
      final now = clock.nowLocal;
      expect(now.difference(DateTime.now()).inMilliseconds.abs(), lessThan(100));
    });
  });

  group('FixedClock', () {
    test('returns fixed UTC time', () {
      final fixedTime = DateTime(2026, 11, 21, 14, 30, 0);
      final clock = FixedClock(fixedTime);
      expect(clock.nowUtc, equals(fixedTime.toUtc()));
    });

    test('returns fixed local time', () {
      final fixedTime = DateTime(2026, 11, 21, 14, 30, 0);
      final clock = FixedClock(fixedTime);
      expect(clock.nowLocal, equals(fixedTime));
    });

    test('always returns the same time', () {
      final fixedTime = DateTime(2026, 11, 21, 14, 30, 0);
      final clock = FixedClock(fixedTime);
      expect(clock.nowUtc, equals(clock.nowUtc));
      expect(clock.nowLocal, equals(clock.nowLocal));
    });
  });

  group('ControllableClock', () {
    test('starts with provided initial time', () {
      final initialTime = DateTime(2026, 11, 21, 10, 0, 0);
      final clock = ControllableClock(initialTime);
      expect(clock.nowLocal, equals(initialTime));
      expect(clock.nowUtc, equals(initialTime.toUtc()));
    });

    test('defaults to current time if no initial time provided', () {
      final clock = ControllableClock();
      expect(clock.nowLocal.difference(DateTime.now()).inMilliseconds.abs(), lessThan(100));
    });

    test('advances time by duration', () {
      final clock = ControllableClock(DateTime(2026, 11, 21, 10, 0, 0));
      clock.advance(const Duration(hours: 2, minutes: 30));
      expect(clock.nowLocal, equals(DateTime(2026, 11, 21, 12, 30, 0)));
    });

    test('advances with negative duration (goes back in time)', () {
      final clock = ControllableClock(DateTime(2026, 11, 21, 10, 0, 0));
      clock.advance(const Duration(hours: -1));
      expect(clock.nowLocal, equals(DateTime(2026, 11, 21, 9, 0, 0)));
    });

    test('sets specific time', () {
      final clock = ControllableClock(DateTime(2026, 11, 21, 10, 0, 0));
      clock.setTime(DateTime(2026, 12, 25, 0, 0, 0));
      expect(clock.nowLocal, equals(DateTime(2026, 12, 25, 0, 0, 0)));
    });

    test('multiple advances accumulate', () {
      final clock = ControllableClock(DateTime(2026, 11, 21, 10, 0, 0));
      clock.advance(const Duration(minutes: 30));
      clock.advance(const Duration(minutes: 45));
      expect(clock.nowLocal, equals(DateTime(2026, 11, 21, 11, 15, 0)));
    });
  });
}