

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "notes" VARCHAR(2000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000),
    "base_unit" VARCHAR(2) NOT NULL,
    "packages" JSONB NOT NULL,
    "minimum" DECIMAL(18,6) NOT NULL,
    "balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID,
    "actor_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "delta" DECIMAL(18,6) NOT NULL,
    "balance_before" DECIMAL(18,6) NOT NULL,
    "balance_after" DECIMAL(18,6) NOT NULL,
    "unit_cost" DECIMAL(18,6),
    "product_name" VARCHAR(150) NOT NULL,
    "supplier_name" VARCHAR(150),
    "base_unit" VARCHAR(2) NOT NULL,
    "package_snapshot" JSONB,
    "reason" VARCHAR(500) NOT NULL,
    "request_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "suppliers_salon_id_active_name_idx" ON "suppliers"("salon_id", "active", "name");


-- CreateIndex
CREATE UNIQUE INDEX "suppliers_salon_id_id_key" ON "suppliers"("salon_id", "id");


-- CreateIndex
CREATE INDEX "products_salon_id_active_name_idx" ON "products"("salon_id", "active", "name");


-- CreateIndex
CREATE UNIQUE INDEX "products_salon_id_id_key" ON "products"("salon_id", "id");


-- CreateIndex
CREATE INDEX "stock_movements_salon_id_product_id_created_at_idx" ON "stock_movements"("salon_id", "product_id", "created_at");


-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_salon_id_request_key_key" ON "stock_movements"("salon_id", "request_key");


-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_salon_id_product_id_fkey" FOREIGN KEY ("salon_id", "product_id") REFERENCES "products"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_salon_id_supplier_id_fkey" FOREIGN KEY ("salon_id", "supplier_id") REFERENCES "suppliers"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_salon_fk FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE RESTRICT;
ALTER TABLE products ADD CONSTRAINT products_salon_fk FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE RESTRICT;
ALTER TABLE products ADD CONSTRAINT products_quantities_check CHECK (balance >= 0 AND minimum >= 0 AND base_unit IN ('un','g','ml'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_actor_fk FOREIGN KEY (salon_id, actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_values_check CHECK (
  quantity >= 0 AND balance_before >= 0 AND balance_after >= 0 AND delta <> 0
  AND balance_after = balance_before + delta AND (unit_cost IS NULL OR unit_cost >= 0)
  AND base_unit IN ('un','g','ml')
  AND ((kind = 'ENTRY' AND delta = quantity) OR (kind IN ('LOSS','OUT') AND delta = -quantity) OR (kind = 'ADJUST' AND balance_after = quantity))
  AND (kind = 'ENTRY' OR (supplier_id IS NULL AND unit_cost IS NULL))
);
CREATE FUNCTION preserve_stock_movements() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stock movements are immutable'; END;
$$;
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON stock_movements FOR EACH STATEMENT EXECUTE FUNCTION preserve_stock_movements();
