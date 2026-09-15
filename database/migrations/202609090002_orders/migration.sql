-- CreateTable
CREATE TABLE "salon_orders" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "client_name" VARCHAR(150) NOT NULL,
    "created_by" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "ready_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "salon_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "professional_name" VARCHAR(150) NOT NULL,
    "appointment_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'WAITING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_items" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "visit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_consumptions" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "movement_id" UUID NOT NULL,
    "unit_cost" DECIMAL(18,6),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_commands" (
    "salon_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_commands_pkey" PRIMARY KEY ("salon_id","request_key")
);

-- CreateIndex
CREATE INDEX "salon_orders_salon_id_status_created_at_idx" ON "salon_orders"("salon_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "salon_orders_salon_id_id_key" ON "salon_orders"("salon_id", "id");

-- CreateIndex
CREATE INDEX "visits_salon_id_professional_id_status_created_at_idx" ON "visits"("salon_id", "professional_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "visits_salon_id_id_key" ON "visits"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visits_salon_id_appointment_id_key" ON "visits"("salon_id", "appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_items_visit_id_position_key" ON "visit_items"("visit_id", "position");

-- CreateIndex
CREATE INDEX "visit_consumptions_salon_id_visit_id_idx" ON "visit_consumptions"("salon_id", "visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_consumptions_salon_id_movement_id_key" ON "visit_consumptions"("salon_id", "movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_salon_id_id_key" ON "stock_movements"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "salon_orders" ADD CONSTRAINT "salon_orders_salon_id_client_id_fkey" FOREIGN KEY ("salon_id", "client_id") REFERENCES "clients"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_salon_id_order_id_fkey" FOREIGN KEY ("salon_id", "order_id") REFERENCES "salon_orders"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_salon_id_professional_id_fkey" FOREIGN KEY ("salon_id", "professional_id") REFERENCES "professionals"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_salon_id_appointment_id_fkey" FOREIGN KEY ("salon_id", "appointment_id") REFERENCES "appointments"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_items" ADD CONSTRAINT "visit_items_salon_id_visit_id_fkey" FOREIGN KEY ("salon_id", "visit_id") REFERENCES "visits"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_items" ADD CONSTRAINT "visit_items_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_consumptions" ADD CONSTRAINT "visit_consumptions_salon_id_visit_id_fkey" FOREIGN KEY ("salon_id", "visit_id") REFERENCES "visits"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_consumptions" ADD CONSTRAINT "visit_consumptions_salon_id_movement_id_fkey" FOREIGN KEY ("salon_id", "movement_id") REFERENCES "stock_movements"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE salon_orders ADD CONSTRAINT order_actor_fk FOREIGN KEY(salon_id,created_by) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
ALTER TABLE salon_orders ADD CONSTRAINT order_values_check CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0 AND discount <= subtotal AND total = subtotal - discount AND status IN ('OPEN','READY','CANCELLED'));
ALTER TABLE salon_orders ADD CONSTRAINT order_client_unique UNIQUE(salon_id,id,client_id);
ALTER TABLE visits ADD CONSTRAINT visit_order_client_fk FOREIGN KEY(salon_id,order_id,client_id) REFERENCES salon_orders(salon_id,id,client_id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD CONSTRAINT appointment_visit_reference UNIQUE(salon_id,id,client_id,professional_id);
ALTER TABLE visits ADD CONSTRAINT visit_appointment_match_fk FOREIGN KEY(salon_id,appointment_id,client_id,professional_id) REFERENCES appointments(salon_id,id,client_id,professional_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE visits ADD CONSTRAINT visit_state_check CHECK (status IN ('WAITING','IN_PROGRESS','COMPLETED','CANCELLED'));
ALTER TABLE visit_items ADD CONSTRAINT visit_item_values CHECK(price >= 0 AND duration_minutes BETWEEN 1 AND 1440 AND position >= 0);
ALTER TABLE visit_consumptions ADD CONSTRAINT consumption_cost_check CHECK(unit_cost IS NULL OR unit_cost >= 0);
ALTER TABLE order_commands ADD CONSTRAINT order_command_actor_fk FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id) ON DELETE RESTRICT;
CREATE TRIGGER consumption_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON visit_consumptions FOR EACH STATEMENT EXECUTE FUNCTION preserve_stock_movements();
CREATE TRIGGER order_command_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON order_commands FOR EACH STATEMENT EXECUTE FUNCTION preserve_stock_movements();
CREATE FUNCTION protect_visit_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text; order_state text;
BEGIN
  SELECT v.status,o.status INTO state,order_state FROM visits v JOIN salon_orders o ON o.id=v.order_id AND o.salon_id=v.salon_id WHERE v.id=COALESCE(NEW.visit_id,OLD.visit_id);
  IF state IN ('COMPLETED','CANCELLED') OR order_state <> 'OPEN' THEN RAISE EXCEPTION 'Closed service values are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER visit_item_immutable_when_closed BEFORE INSERT OR UPDATE OR DELETE ON visit_items FOR EACH ROW EXECUTE FUNCTION protect_visit_items();
