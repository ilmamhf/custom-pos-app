-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('MIDTRANS', 'XENDIT', 'GENERIC');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'FAILED', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('AUTHORIZATION', 'CAPTURE', 'VOID', 'REFUND', 'SETTLEMENT');

-- AlterTable
ALTER TABLE "sale_tenders" ADD COLUMN     "payment_transaction_id" UUID;

-- CreateTable
CREATE TABLE "payment_providers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "PaymentProviderType" NOT NULL,
    "config" JSONB NOT NULL,
    "supportedMethods" "PaymentMethod"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "sale_id" UUID,
    "tender_id" UUID,
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "external_id" VARCHAR(100),
    "reference" VARCHAR(100),
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_tender_id_key" ON "payment_transactions"("tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_id_idx" ON "payment_transactions"("provider_id");

-- CreateIndex
CREATE INDEX "payment_transactions_sale_id_idx" ON "payment_transactions"("sale_id");

-- CreateIndex
CREATE INDEX "payment_transactions_external_id_idx" ON "payment_transactions"("external_id");

-- CreateIndex
CREATE INDEX "payment_transactions_idempotency_key_idx" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "sale_tenders_payment_transaction_id_key" ON "sale_tenders"("payment_transaction_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "sale_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
