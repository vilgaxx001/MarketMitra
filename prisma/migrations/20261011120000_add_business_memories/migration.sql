-- CreateEnum
CREATE TYPE "BusinessMemoryType" AS ENUM ('BUSINESS_FACT', 'BUSINESS_PREFERENCE', 'BUSINESS_GOAL', 'BUSINESS_CONSTRAINT');

-- CreateEnum
CREATE TYPE "BusinessMemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "business_memories" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "BusinessMemoryType" NOT NULL,
    "status" "BusinessMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" VARCHAR(120),
    "content" VARCHAR(2000) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_memories_businessId_status_createdAt_idx" ON "business_memories"("businessId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "business_memories" ADD CONSTRAINT "business_memories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memories" ADD CONSTRAINT "business_memories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memories" ADD CONSTRAINT "business_memories_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
