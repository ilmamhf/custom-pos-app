-- CreateTable
CREATE TABLE "sale_tenders" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "change" BIGINT NOT NULL DEFAULT 0,
    "reference" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_tenders_sale_id_idx" ON "sale_tenders"("sale_id");

-- AddForeignKey
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
