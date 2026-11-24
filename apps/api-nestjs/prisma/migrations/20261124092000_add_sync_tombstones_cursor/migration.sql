-- CreateTable
CREATE TABLE "sync_cursors" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "cursor" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tombstones" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_tombstones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_cursors_store_id_key" ON "sync_cursors"("store_id");

-- CreateIndex
CREATE INDEX "product_tombstones_store_id_idx" ON "product_tombstones"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_tombstones_store_id_product_id_key" ON "product_tombstones"("store_id", "product_id");

-- AddForeignKey
ALTER TABLE "product_tombstones" ADD CONSTRAINT "product_tombstones_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
