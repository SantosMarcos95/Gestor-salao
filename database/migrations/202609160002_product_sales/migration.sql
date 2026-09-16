ALTER TABLE products ADD COLUMN sale_price DECIMAL(14,2), ADD COLUMN sale_quantity DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE products ADD CONSTRAINT products_sale_check CHECK (sale_quantity > 0 AND (sale_price IS NULL OR sale_price > 0));

CREATE TABLE order_product_items (
  id UUID PRIMARY KEY,
  salon_id UUID NOT NULL,
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  movement_id UUID,
  product_name VARCHAR(150) NOT NULL,
  base_unit VARCHAR(2) NOT NULL,
  sale_quantity DECIMAL(18,6) NOT NULL,
  units INTEGER NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_product_values_check CHECK (sale_quantity > 0 AND units > 0 AND units <= 10000 AND unit_price > 0 AND total = unit_price * units AND base_unit IN ('un','g','ml')),
  CONSTRAINT order_product_order_fk FOREIGN KEY (salon_id,order_id) REFERENCES salon_orders(salon_id,id) ON DELETE RESTRICT,
  CONSTRAINT order_product_product_fk FOREIGN KEY (salon_id,product_id) REFERENCES products(salon_id,id) ON DELETE RESTRICT,
  CONSTRAINT order_product_movement_fk FOREIGN KEY (salon_id,movement_id) REFERENCES stock_movements(salon_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX order_product_items_salon_id_id_key ON order_product_items(salon_id,id);
CREATE UNIQUE INDEX order_product_items_movement_id_key ON order_product_items(movement_id);
CREATE UNIQUE INDEX order_product_items_salon_id_movement_id_key ON order_product_items(salon_id,movement_id);
CREATE INDEX order_product_items_salon_id_order_id_idx ON order_product_items(salon_id,order_id);

ALTER TABLE stock_movements DROP CONSTRAINT stock_values_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_values_check CHECK (
  quantity >= 0 AND balance_before >= 0 AND balance_after >= 0 AND delta <> 0
  AND balance_after = balance_before + delta AND (unit_cost IS NULL OR unit_cost >= 0)
  AND base_unit IN ('un','g','ml')
  AND ((kind = 'ENTRY' AND delta = quantity) OR (kind IN ('LOSS','OUT','SALE') AND delta = -quantity) OR (kind = 'ADJUST' AND balance_after = quantity))
  AND (kind = 'ENTRY' OR (supplier_id IS NULL AND unit_cost IS NULL))
);

CREATE FUNCTION protect_order_product_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_state VARCHAR(12); stock_product UUID; stock_kind VARCHAR(10); stock_quantity DECIMAL(18,6);
BEGIN
  SELECT status INTO order_state FROM salon_orders WHERE salon_id=COALESCE(NEW.salon_id,OLD.salon_id) AND id=COALESCE(NEW.order_id,OLD.order_id);
  IF TG_OP = 'UPDATE' AND OLD.movement_id IS NULL AND NEW.movement_id IS NOT NULL
    AND NEW.id=OLD.id AND NEW.salon_id=OLD.salon_id AND NEW.order_id=OLD.order_id
    AND NEW.product_id=OLD.product_id AND NEW.product_name=OLD.product_name
    AND NEW.base_unit=OLD.base_unit AND NEW.sale_quantity=OLD.sale_quantity
    AND NEW.units=OLD.units AND NEW.unit_price=OLD.unit_price AND NEW.total=OLD.total
    AND order_state='READY' THEN
    SELECT product_id,kind,quantity INTO stock_product,stock_kind,stock_quantity FROM stock_movements
      WHERE salon_id=NEW.salon_id AND id=NEW.movement_id;
    IF stock_product IS DISTINCT FROM NEW.product_id OR stock_kind IS DISTINCT FROM 'SALE' OR stock_quantity IS DISTINCT FROM NEW.sale_quantity*NEW.units
      THEN RAISE EXCEPTION 'Invalid sale stock movement'; END IF;
    RETURN NEW;
  END IF;
  IF order_state <> 'OPEN' THEN RAISE EXCEPTION 'Order product items cannot be changed after finalization'; END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE TRIGGER order_product_item_protection BEFORE INSERT OR UPDATE OR DELETE ON order_product_items FOR EACH ROW EXECUTE FUNCTION protect_order_product_items();
