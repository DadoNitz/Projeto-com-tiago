-- Preço de mercado de referência por modelo de peça (worker de preços).
ALTER TABLE "products" ADD COLUMN "referencePrice" DECIMAL(12,2),
ADD COLUMN "referencePriceKind" TEXT,
ADD COLUMN "referencePriceStatus" TEXT,
ADD COLUMN "referencePriceAt" TIMESTAMP(3),
ADD COLUMN "referencePriceData" JSONB;
