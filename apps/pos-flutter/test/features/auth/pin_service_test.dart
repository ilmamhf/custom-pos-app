import 'package:flutter_test/flutter_test.dart';
import 'package:pos_flutter/features/auth/pin_service.dart';

void main() {
  group('validatePin', () {
    test('accepts exactly six digits', () {
      expect(validatePin('123456'), isNull);
    });

    test('rejects null and empty input', () {
      expect(validatePin(null), 'Please enter PIN');
      expect(validatePin(''), 'Please enter PIN');
    });

    test('rejects wrong lengths', () {
      expect(validatePin('12345'), 'PIN must be 6 digits');
      expect(validatePin('1234567'), 'PIN must be 6 digits');
    });

    test('rejects non-numeric input', () {
      expect(validatePin('12a456'), 'PIN must be 6 digits');
      expect(validatePin(' 12345'), 'PIN must be 6 digits');
    });
  });

  group('hashPin', () {
    test('is deterministic for the same salt', () {
      expect(hashPin('123456', 'salt'), hashPin('123456', 'salt'));
    });

    test('differs with another salt', () {
      expect(hashPin('123456', 'salt-a'), isNot(hashPin('123456', 'salt-b')));
    });

    test('differs for another pin', () {
      expect(hashPin('123456', 'salt'), isNot(hashPin('654321', 'salt')));
    });

    test('never returns the raw pin', () {
      expect(hashPin('123456', 'salt'), isNot(contains('123456')));
    });
  });
}
