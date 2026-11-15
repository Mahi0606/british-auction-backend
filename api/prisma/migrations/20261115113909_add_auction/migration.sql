-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "ExtensionTrigger" AS ENUM ('ANY_BID', 'ANY_RANK_CHANGE', 'L1_CHANGE');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "originalCloseTime" TIMESTAMP(3) NOT NULL,
    "currentCloseTime" TIMESTAMP(3) NOT NULL,
    "forcedCloseTime" TIMESTAMP(3) NOT NULL,
    "triggerWindowMinutes" INTEGER NOT NULL,
    "extensionDurationMinutes" INTEGER NOT NULL,
    "extensionTrigger" "ExtensionTrigger" NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_rfqId_key" ON "Auction"("rfqId");

-- CreateIndex
CREATE INDEX "Auction_status_currentCloseTime_idx" ON "Auction"("status", "currentCloseTime");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
