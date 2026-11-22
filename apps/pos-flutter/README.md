# Retail POS Flutter

Offline-first Flutter cashier application for a 1 to 3 store retail business.

## Run on web

```bash
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

The browser build presents the application in a 412dp-wide phone frame on
desktop screens. Browser databases persist in IndexedDB through SQLite WASM.
Use **Open offline demo** on the login screen to try the complete checkout flow
with labeled sample products; demo records stay in the current browser and are
not sent to the server.

## Run on a mobile device

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

## Verify

```bash
flutter analyze
flutter test
flutter build web
```
