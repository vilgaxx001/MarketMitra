-- CreateEnum
CREATE TYPE "AIDetailLevel" AS ENUM ('CONCISE', 'STANDARD', 'DETAILED');

-- CreateEnum
CREATE TYPE "AIFormattingPreference" AS ENUM ('NO_PREFERENCE', 'PLAIN_TEXT', 'MARKDOWN', 'BULLET_POINTS');

-- CreateTable
CREATE TABLE "business_ai_preferences" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "detailLevel" "AIDetailLevel" NOT NULL DEFAULT 'STANDARD',
    "formatting" "AIFormattingPreference" NOT NULL DEFAULT 'NO_PREFERENCE',
    "businessInstructions" VARCHAR(1000),
    "behaviorConstraints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_ai_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_ai_preferences_businessId_key" ON "business_ai_preferences"("businessId");

-- AddForeignKey
ALTER TABLE "business_ai_preferences" ADD CONSTRAINT "business_ai_preferences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
