-- Socios (quem financia as pecas), valores de venda por unidade,
-- versao das imagens sem fundo, e anuncios de venda.
--
-- Ver docs/02-MODELAGEM.md.

-- CreateEnum
CREATE TYPE "ListingChannel" AS ENUM ('FACEBOOK_MARKETPLACE', 'OLX', 'MERCADO_LIVRE', 'WHATSAPP', 'INSTAGRAM', 'OUTRO');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "inventory_units" ADD COLUMN     "purchasedById" TEXT,
ADD COLUMN     "soldAt" TIMESTAMP(3),
ADD COLUMN     "soldPrice" DECIMAL(12,2),
ADD COLUMN     "soldToName" TEXT;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "cutoutKey" TEXT;

-- AlterTable
ALTER TABLE "unit_images" ADD COLUMN     "cutoutKey" TEXT;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "buildId" TEXT,
    "channel" "ListingChannel" NOT NULL DEFAULT 'FACEBOOK_MARKETPLACE',
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "shortText" TEXT,
    "imageKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiPrompt" TEXT,
    "publishedAt" TIMESTAMP(3),
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_slug_key" ON "partners"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "partners_userId_key" ON "partners"("userId");

-- CreateIndex
CREATE INDEX "partners_deletedAt_idx" ON "partners"("deletedAt");

-- CreateIndex
CREATE INDEX "listings_unitId_idx" ON "listings"("unitId");

-- CreateIndex
CREATE INDEX "listings_buildId_idx" ON "listings"("buildId");

-- CreateIndex
CREATE INDEX "listings_status_channel_idx" ON "listings"("status", "channel");

-- CreateIndex
CREATE INDEX "listings_deletedAt_idx" ON "listings"("deletedAt");

-- CreateIndex
CREATE INDEX "inventory_movements_partnerId_createdAt_idx" ON "inventory_movements"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_units_purchasedById_deletedAt_idx" ON "inventory_units"("purchasedById", "deletedAt");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "inventory_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

