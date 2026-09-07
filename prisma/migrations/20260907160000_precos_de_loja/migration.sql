-- CreateTable
CREATE TABLE "store_products" (
    "id" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_prices" (
    "id" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_products_storeSlug_url_key" ON "store_products"("storeSlug", "url");

-- CreateIndex
CREATE INDEX "store_products_storeSlug_name_idx" ON "store_products"("storeSlug", "name");

-- CreateIndex
CREATE UNIQUE INDEX "store_prices_storeSlug_query_key" ON "store_prices"("storeSlug", "query");

-- CreateIndex
CREATE INDEX "store_prices_fetchedAt_idx" ON "store_prices"("fetchedAt");
