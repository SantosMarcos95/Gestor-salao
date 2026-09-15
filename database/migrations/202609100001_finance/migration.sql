-- CreateTable
CREATE TABLE "order_sales" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tendered" DECIMAL(14,2) NOT NULL,
    "change" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(150),
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(150),
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_voids" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_voids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_sales_salon_id_created_at_idx" ON "order_sales"("salon_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_sales_salon_id_order_id_key" ON "order_sales"("salon_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_salon_id_created_at_idx" ON "payments"("salon_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_salon_id_id_key" ON "payments"("salon_id", "id");

-- CreateIndex
CREATE INDEX "payment_refunds_salon_id_created_at_idx" ON "payment_refunds"("salon_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_voids_salon_id_created_at_idx" ON "sale_voids"("salon_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_voids_salon_id_order_id_key" ON "sale_voids"("salon_id", "order_id");

-- AddForeignKey
ALTER TABLE "order_sales" ADD CONSTRAINT "order_sales_salon_id_order_id_fkey" FOREIGN KEY ("salon_id", "order_id") REFERENCES "salon_orders"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_salon_id_order_id_fkey" FOREIGN KEY ("salon_id", "order_id") REFERENCES "order_sales"("salon_id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_salon_id_payment_id_fkey" FOREIGN KEY ("salon_id", "payment_id") REFERENCES "payments"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_salon_id_order_id_fkey" FOREIGN KEY ("salon_id", "order_id") REFERENCES "order_sales"("salon_id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE salon_orders DROP CONSTRAINT order_values_check;
ALTER TABLE salon_orders ADD CONSTRAINT order_values_check CHECK(subtotal >= 0 AND discount >= 0 AND total >= 0 AND discount <= subtotal AND total = subtotal-discount AND status IN ('OPEN','READY','CLOSED','DUE','CANCELLED'));
ALTER TABLE order_sales ADD CONSTRAINT sale_actor_fk FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT payment_actor_fk FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE payment_refunds ADD CONSTRAINT refund_actor_fk FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE sale_voids ADD CONSTRAINT void_actor_fk FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE order_sales ADD CONSTRAINT sale_amount_check CHECK(total >= 0);
ALTER TABLE payments ADD CONSTRAINT payment_amount_check CHECK(amount > 0 AND tendered >= amount AND change = tendered - amount AND method IN ('CASH','PIX','CREDIT','DEBIT','OTHER') AND (method = 'CASH' OR change = 0));
ALTER TABLE payment_refunds ADD CONSTRAINT refund_amount_check CHECK(amount > 0);
ALTER TABLE sale_voids ADD CONSTRAINT void_amount_check CHECK(total >= 0);
CREATE FUNCTION preserve_financial_entries() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial entries are immutable'; END; $$;
CREATE TRIGGER sale_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON order_sales FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payments FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE TRIGGER refund_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_refunds FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE TRIGGER sale_void_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sale_voids FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE FUNCTION check_payment_refund_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE paid numeric; refunded numeric;
BEGIN
  SELECT amount INTO paid FROM payments WHERE id=NEW.payment_id AND salon_id=NEW.salon_id FOR UPDATE;
  SELECT COALESCE(SUM(amount),0) INTO refunded FROM payment_refunds WHERE payment_id=NEW.payment_id AND salon_id=NEW.salon_id;
  IF paid IS NULL OR refunded + NEW.amount > paid THEN RAISE EXCEPTION 'Refund exceeds payment'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payment_refund_limit BEFORE INSERT ON payment_refunds FOR EACH ROW EXECUTE FUNCTION check_payment_refund_limit();
