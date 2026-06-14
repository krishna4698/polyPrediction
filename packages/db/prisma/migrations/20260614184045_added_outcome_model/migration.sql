-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'Active';

-- CreateTable
CREATE TABLE "Outcomes" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Outcomes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Outcomes" ADD CONSTRAINT "Outcomes_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
