# Setup from zero (local dev)

## 0. Prerequisites
Node 20+, npm, Flutter stable, Docker Desktop running, Chrome.

## 1. Database (fresh)
```powershell
cd D:\AI-Dev-Projects\custom-pos-1
docker compose down -v
docker compose up --wait -d postgres
```

Reset data only (keeps the container/volume):
```powershell
cd apps\api-nestjs
npx prisma migrate reset --force
npm run prisma:seed
```

## 2. API
```powershell
cd apps\api-nestjs
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```
- http://localhost:3000/api/v1
- http://localhost:3000/api/docs

## 3. React Admin
```powershell
cd apps\admin-react
npm ci
npm run dev
```
- http://localhost:5173

## 4. Flutter POS
```powershell
cd apps\pos-flutter
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

## 5. After any DB reset — clear Flutter browser data
Chrome DevTools → Application → Storage → **Clear site data** for the Flutter origin (`http://localhost:<flutter-port>`), or delete its IndexedDB.

## 6. Seeded logins
```text
Owner    owner@toko.id          password123  PIN 123456
Manager  manager.bks@toko.id    password123  PIN 123456
Cashier  kasir1@toko.id         password123
```

## 7. Tests
```powershell
cd apps\api-nestjs
npm test
npm run test:e2e

cd apps\admin-react
npm run typecheck
$env:NODE_ENV='test'; npm test

cd apps\pos-flutter
flutter analyze
flutter test
```

## 8. Day-to-day start (already set up)
```powershell
cd D:\AI-Dev-Projects\custom-pos-1
docker compose up -d postgres

cd apps\api-nestjs
npm run start:dev

cd apps\admin-react
npm run dev

cd apps\pos-flutter
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

## 9. Useful checks
```powershell
cd apps\api-nestjs
npx prisma migrate status

cd D:\AI-Dev-Projects\custom-pos-1
docker compose ps
docker compose logs postgres
```
