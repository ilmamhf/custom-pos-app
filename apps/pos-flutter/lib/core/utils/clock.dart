/// Clock abstraction for testability.
/// Allows injecting a fixed or controllable time source in tests.

/// Interface for obtaining the current date/time.
abstract class Clock {
  /// Returns the current date/time in UTC.
  DateTime get nowUtc;

  /// Returns the current date/time in local timezone.
  DateTime get nowLocal;
}

/// Production implementation using `DateTime.now()`.
class SystemClock implements Clock {
  @override
  DateTime get nowUtc => DateTime.now().toUtc();

  @override
  DateTime get nowLocal => DateTime.now();
}

/// Fixed clock for testing - returns a constant time.
class FixedClock implements Clock {
  final DateTime _fixedTime;

  FixedClock(this._fixedTime);

  @override
  DateTime get nowUtc => _fixedTime.toUtc();

  @override
  DateTime get nowLocal => _fixedTime;
}

/// Clock that can be advanced manually for testing time-dependent logic.
class ControllableClock implements Clock {
  DateTime _currentTime;

  ControllableClock([DateTime? initialTime]) : _currentTime = initialTime ?? DateTime.now();

  @override
  DateTime get nowUtc => _currentTime.toUtc();

  @override
  DateTime get nowLocal => _currentTime;

  /// Advances the clock by the given duration.
  void advance(Duration duration) {
    _currentTime = _currentTime.add(duration);
  }

  /// Sets the clock to a specific time.
  void setTime(DateTime time) {
    _currentTime = time;
  }
}

/// Default clock instance for production use.
final Clock defaultClock = SystemClock();