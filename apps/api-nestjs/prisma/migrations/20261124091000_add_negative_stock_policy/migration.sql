-- CreateEnum
CREATE TYPE "NegativeStockAction" AS ENUM ('ALERT_ONLY', 'AUTO_TRANSFER', 'MANAGER_APPROVAL', 'WRITE_OFF');

-- CreateTable
CREATE TABLE "negative_stock_policies" (
    "id" UUID NOT NULL,
    "store_id" UUID,
    "alert_threshold" INTEGER NOT NULL DEFAULT 0,
    "auto_transfer_threshold" INTEGER NOT NULL DEFAULT -10,
    "approval_threshold" INTEGER NOT NULL DEFAULT -50,
    "write_off_threshold" INTEGER NOT NULL DEFAULT -100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negative_stock_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negative_stock_events" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "action_taken" "NegativeStockAction" NOT NULL,
    "detail" JSONB,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negative_stock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negative_stock_policies_store_id_key" ON "negative_stock_policies"("store_id");

-- CreateIndex
CREATE INDEX "negative_stock_events_store_id_product_id_idx" ON "negative_stock_events"("store_id", "product_id");

-- CreateIndex
CREATE INDEX "negative_stock_events_created_at_idx" ON "negative_stock_events"("created_at");

-- AddForeignKey
ALTER TABLE "negative_stock_policies" ADD CONSTRAINT "negative_stock_policies_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negative_stock_events" ADD CONSTRAINT "negative_stock_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negative_stock_events" ADD CONSTRAINT "negative_stock_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negative_stock_events" ADD CONSTRAINT "negative_stock_events_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
