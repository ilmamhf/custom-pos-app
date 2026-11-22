import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductImportGroup,
  ProductImportParseResult,
  ProductImportRowError,
  ProductImportStoreValues,
  ProductImportSummary,
} from './products-import.types';

export interface ProductImportOptions {
  dryRun: boolean;
  batchSize: number;
}

export interface ProductImportResult {
  summary: ProductImportSummary;
  errors: ProductImportRowError[];
}

export interface ExistingProductSummary {
  sku: string;
}

export interface ExistingInventorySummary {
  sku: string;
  storeCode: string;
}

export interface ProductImportPlan {
  productsInserted: number;
  productsUpdated: number;
  inventoryInserted: number;
  inventoryUpdated: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function inventoryKey(sku: string, storeCode: string): string {
  return `${sku}\u0000${storeCode}`;
}

export function createProductImportPlan(
  groups: ProductImportGroup[],
  stores: Array<{ code: string }>,
  existingProducts: Map<string, ExistingProductSummary>,
  existingInventory: Map<string, ExistingInventorySummary>,
): ProductImportPlan {
  const plan: ProductImportPlan = {
    productsInserted: 0,
    productsUpdated: 0,
    inventoryInserted: 0,
    inventoryUpdated: 0,
  };

  for (const group of groups) {
    if (!existingProducts.has(group.sku)) {
      plan.productsInserted += 1;
      for (const store of stores) {
        const key = inventoryKey(group.sku, store.code);
        if (existingInventory.has(key)) {
          plan.inventoryUpdated += 1;
        } else {
          plan.inventoryInserted += 1;
        }
      }
      continue;
    }

    plan.productsUpdated += 1;
    for (const target of group.stores) {
      const key = inventoryKey(group.sku, target.storeCode);
      if (existingInventory.has(key)) {
        plan.inventoryUpdated += 1;
      } else {
        plan.inventoryInserted += 1;
      }
    }
  }

  return plan;
}

export class ProductsImportService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    parsed: ProductImportParseResult,
    options: ProductImportOptions,
  ): Promise<ProductImportResult> {
    const stores = await this.prisma.store.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const storesByCode = new Map(stores.map((store) => [store.code, store]));

    const errors = [...parsed.errors];
    const invalidGroups = new Set<ProductImportGroup>();
    for (const group of parsed.groups) {
      const groupErrors = [...group.errors];
      for (const target of group.stores) {
        if (!storesByCode.has(target.storeCode)) {
          groupErrors.push({
            rowNumber: target.rowNumber,
            sku: group.sku,
            field: 'storeCode',
            message: `storeCode ${target.storeCode} does not exist`,
          });
        }
      }
      errors.push(...groupErrors);
      if (groupErrors.length > 0) invalidGroups.add(group);
    }

    const rejectedRows = new Set<number>();
    for (const error of errors) rejectedRows.add(error.rowNumber);
    for (const group of invalidGroups) {
      for (const rowNumber of group.sourceRows) rejectedRows.add(rowNumber);
    }

    const validGroups = parsed.groups.filter(
      (group) => !invalidGroups.has(group),
    );
    const validRows = validGroups.reduce(
      (total, group) => total + group.sourceRows.length,
      0,
    );
    const skus = validGroups.map((group) => group.sku);
    const [existingProducts, existingInventory] = await Promise.all([
      this.findExistingProducts(skus),
      this.findExistingInventory(skus),
    ]);
    const plan = createProductImportPlan(
      validGroups,
      stores,
      existingProducts,
      existingInventory,
    );

    if (errors.length > 0) {
      return {
        errors,
        summary: {
          mode: options.dryRun ? 'dry-run' : 'import',
          rowsRead: parsed.totalRows,
          validRows,
          rejectedRows: rejectedRows.size,
          productsInserted: 0,
          productsUpdated: 0,
          inventoryInserted: 0,
          inventoryUpdated: 0,
        },
      };
    }

    if (options.dryRun) {
      return {
        errors,
        summary: {
          mode: 'dry-run',
          rowsRead: parsed.totalRows,
          validRows,
          rejectedRows: 0,
          productsInserted: plan.productsInserted,
          productsUpdated: plan.productsUpdated,
          inventoryInserted: plan.inventoryInserted,
          inventoryUpdated: plan.inventoryUpdated,
        },
      };
    }

    await this.executeImport(
      validGroups,
      stores,
      existingProducts,
      options.batchSize,
    );

    return {
      errors,
      summary: {
        mode: 'import',
        rowsRead: parsed.totalRows,
        validRows,
        rejectedRows: 0,
        productsInserted: plan.productsInserted,
        productsUpdated: plan.productsUpdated,
        inventoryInserted: plan.inventoryInserted,
        inventoryUpdated: plan.inventoryUpdated,
      },
    };
  }

  private async findExistingProducts(
    skus: string[],
  ): Promise<Map<string, ExistingProductSummary>> {
    const result = new Map<string, ExistingProductSummary>();
    for (const skuChunk of chunk(skus, 1000)) {
      const products = await this.prisma.product.findMany({
        where: { sku: { in: skuChunk } },
        select: { sku: true },
      });
      for (const product of products) {
        result.set(product.sku, product);
      }
    }
    return result;
  }

  private async findExistingInventory(
    skus: string[],
  ): Promise<Map<string, ExistingInventorySummary>> {
    const result = new Map<string, ExistingInventorySummary>();
    for (const skuChunk of chunk(skus, 1000)) {
      const inventory = await this.prisma.storeInventory.findMany({
        where: { product: { sku: { in: skuChunk } } },
        select: {
          stockOnHand: true,
          product: { select: { sku: true } },
          store: { select: { code: true } },
        },
      });
      for (const item of inventory) {
        result.set(inventoryKey(item.product.sku, item.store.code), {
          sku: item.product.sku,
          storeCode: item.store.code,
        });
      }
    }
    return result;
  }

  private async executeImport(
    groups: ProductImportGroup[],
    stores: Array<{ id: string; code: string }>,
    existingProducts: Map<string, ExistingProductSummary>,
    batchSize: number,
  ): Promise<void> {
    for (const groupChunk of chunk(groups, batchSize)) {
      await this.prisma.$transaction(
        async (tx) => {
          for (const group of groupChunk) {
            const productUpdate: Record<string, unknown> = {
              name: group.name,
              basePrice: BigInt(group.basePrice),
            };
            if (group.barcode !== undefined)
              productUpdate.barcode = group.barcode;
            if (group.costPrice !== undefined) {
              productUpdate.costPrice = BigInt(group.costPrice);
            }
            if (group.isActive !== undefined)
              productUpdate.isActive = group.isActive;

            const product = await tx.product.upsert({
              where: { sku: group.sku },
              create: {
                sku: group.sku,
                barcode: group.barcode ?? null,
                name: group.name,
                basePrice: BigInt(group.basePrice),
                costPrice: BigInt(group.costPrice ?? 0),
                isActive: group.isActive ?? true,
              },
              update: productUpdate,
            });

            if (!existingProducts.has(group.sku)) {
              for (const store of stores) {
                const target = group.stores.find(
                  (candidate) => candidate.storeCode === store.code,
                );
                await this.upsertInventory(tx, store.id, product.id, target);
              }
            } else {
              for (const target of group.stores) {
                const store = stores.find(
                  (candidate) => candidate.code === target.storeCode,
                );
                if (!store) continue;
                await this.upsertInventory(tx, store.id, product.id, target);
              }
            }
          }
        },
        { maxWait: 10_000, timeout: 120_000 },
      );
    }
  }

  private async upsertInventory(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    target: ProductImportStoreValues | undefined,
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    if (target?.stockOnHand !== undefined) {
      update.stockOnHand = target.stockOnHand;
    }
    if (target?.priceOverride !== undefined) {
      update.priceOverride =
        target.priceOverride === null ? null : BigInt(target.priceOverride);
    }

    await tx.storeInventory.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: {
        storeId,
        productId,
        stockOnHand: target?.stockOnHand ?? 0,
        priceOverride:
          target?.priceOverride === null || target?.priceOverride === undefined
            ? null
            : BigInt(target.priceOverride),
      },
      update,
    });
  }
}
