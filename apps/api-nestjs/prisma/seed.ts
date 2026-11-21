import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial data...');

  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('123456', 10);

  // 1. Stores
  const storeBekasi = await prisma.store.upsert({
    where: { code: 'BKS' },
    update: {},
    create: {
      name: 'Cabang Bekasi',
      code: 'BKS',
      address: 'Jl. Ahmad Yani No. 10, Bekasi',
      taxRateBps: 1100, // 11%
      isActive: true,
    },
  });

  const storeKemang = await prisma.store.upsert({
    where: { code: 'KMG' },
    update: {},
    create: {
      name: 'Cabang Kemang',
      code: 'KMG',
      address: 'Jl. Kemang Raya No. 45, Jakarta Selatan',
      taxRateBps: 1100, // 11%
      isActive: true,
    },
  });

  console.log(`Seeded stores: ${storeBekasi.code}, ${storeKemang.code}`);

  // 2. Users
  const owner = await prisma.user.upsert({
    where: { email: 'owner@toko.id' },
    update: { passwordHash, pinHash },
    create: {
      name: 'Owner Utama',
      email: 'owner@toko.id',
      passwordHash,
      pinHash,
      role: Role.OWNER,
      isActive: true,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager.bks@toko.id' },
    update: { passwordHash, pinHash },
    create: {
      name: 'Sari Manager',
      email: 'manager.bks@toko.id',
      passwordHash,
      pinHash,
      role: Role.MANAGER,
      isActive: true,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: 'kasir1@toko.id' },
    update: { passwordHash },
    create: {
      name: 'Budi Kasir',
      email: 'kasir1@toko.id',
      passwordHash,
      pinHash: null,
      role: Role.CASHIER,
      isActive: true,
    },
  });

  // User store assignments
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: owner.id, storeId: storeBekasi.id } },
    update: {},
    create: { userId: owner.id, storeId: storeBekasi.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: owner.id, storeId: storeKemang.id } },
    update: {},
    create: { userId: owner.id, storeId: storeKemang.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: manager.id, storeId: storeBekasi.id } },
    update: {},
    create: { userId: manager.id, storeId: storeBekasi.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: cashier.id, storeId: storeBekasi.id } },
    update: {},
    create: { userId: cashier.id, storeId: storeBekasi.id },
  });

  console.log('Seeded users and store assignments');

  // 3. Products
  const productsData = [
    {
      sku: 'KOPI-001',
      barcode: '8991234567890',
      name: 'Kopi Susu Gula Aren',
      basePrice: 18000n,
      costPrice: 9000n,
      bekasiStock: 50,
      kemangStock: 30,
      kemangOverride: 20000n,
    },
    {
      sku: 'ROTI-001',
      barcode: '8991234567891',
      name: 'Roti Coklat Klasik',
      basePrice: 12000n,
      costPrice: 6000n,
      bekasiStock: 40,
      kemangStock: 25,
      kemangOverride: null,
    },
    {
      sku: 'TEH-001',
      barcode: '8991234567892',
      name: 'Es Teh Manis Melati',
      basePrice: 8000n,
      costPrice: 3000n,
      bekasiStock: 100,
      kemangStock: 60,
      kemangOverride: null,
    },
  ];

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        basePrice: p.basePrice,
        costPrice: p.costPrice,
        barcode: p.barcode,
      },
      create: {
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        basePrice: p.basePrice,
        costPrice: p.costPrice,
        isActive: true,
      },
    });

    // Store Bekasi stock
    await prisma.storeInventory.upsert({
      where: { storeId_productId: { storeId: storeBekasi.id, productId: product.id } },
      update: { stockOnHand: p.bekasiStock },
      create: {
        storeId: storeBekasi.id,
        productId: product.id,
        stockOnHand: p.bekasiStock,
        priceOverride: null,
      },
    });

    // Store Kemang stock
    await prisma.storeInventory.upsert({
      where: { storeId_productId: { storeId: storeKemang.id, productId: product.id } },
      update: {
        stockOnHand: p.kemangStock,
        priceOverride: p.kemangOverride,
      },
      create: {
        storeId: storeKemang.id,
        productId: product.id,
        stockOnHand: p.kemangStock,
        priceOverride: p.kemangOverride,
      },
    });
  }

  console.log('Seeded products and initial store inventories successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
