-- CreateEnum
CREATE TYPE "RFQStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "buyerId" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "status" "RFQStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_referenceId_key" ON "RFQ"("referenceId");

-- CreateIndex
CREATE INDEX "RFQ_buyerId_idx" ON "RFQ"("buyerId");

-- CreateIndex
CREATE INDEX "RFQ_status_idx" ON "RFQ"("status");

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
