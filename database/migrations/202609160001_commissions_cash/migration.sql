ALTER TABLE professionals ADD COLUMN commission_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate BETWEEN 0 AND 100);
CREATE TABLE commission_bases (
 id uuid PRIMARY KEY, salon_id uuid NOT NULL, order_id uuid NOT NULL, professional_id uuid NOT NULL,
 item_id uuid NOT NULL UNIQUE REFERENCES visit_items(id), professional_name varchar(150) NOT NULL,
 service_name varchar(150) NOT NULL, rate numeric(5,2) NOT NULL CHECK(rate BETWEEN 0 AND 100),
 base numeric(14,2) NOT NULL CHECK(base>=0), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(salon_id,id),
 FOREIGN KEY(salon_id,order_id) REFERENCES order_sales(salon_id,order_id),
 FOREIGN KEY(salon_id,professional_id) REFERENCES professionals(salon_id,id)
);
CREATE INDEX commission_bases_salon_id_order_id_idx ON commission_bases(salon_id,order_id);
CREATE TABLE commission_entries (
 id uuid PRIMARY KEY, salon_id uuid NOT NULL, basis_id uuid NOT NULL, event_id uuid NOT NULL,
 base numeric(14,2) NOT NULL, amount numeric(14,2) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(basis_id,event_id), FOREIGN KEY(salon_id,basis_id) REFERENCES commission_bases(salon_id,id)
);
CREATE INDEX commission_entries_salon_id_created_at_idx ON commission_entries(salon_id,created_at);
ALTER TABLE commission_entries ADD CONSTRAINT commission_event_command_fk FOREIGN KEY(salon_id,event_id) REFERENCES order_commands(salon_id,request_key) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION check_commission_basis_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM i.id FROM visit_items i JOIN visits v ON v.id=i.visit_id AND v.salon_id=i.salon_id
 WHERE i.id=NEW.item_id AND i.salon_id=NEW.salon_id AND v.order_id=NEW.order_id AND v.professional_id=NEW.professional_id AND v.status='COMPLETED';
 IF NOT FOUND THEN RAISE EXCEPTION 'Commission item scope mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER commission_basis_scope BEFORE INSERT ON commission_bases FOR EACH ROW EXECUTE FUNCTION check_commission_basis_scope();
CREATE TABLE cash_sessions (
 id uuid PRIMARY KEY, salon_id uuid NOT NULL REFERENCES salons(id), opened_by uuid NOT NULL, closed_by uuid,
 opening numeric(14,2) NOT NULL CHECK(opening>=0), counted numeric(14,2), expected numeric(14,2), difference numeric(14,2),
 closing_reason varchar(500), opened_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at timestamptz(3),
 UNIQUE(salon_id,id), FOREIGN KEY(salon_id,opened_by) REFERENCES salon_users(salon_id,id),
 FOREIGN KEY(salon_id,closed_by) REFERENCES salon_users(salon_id,id),
 CHECK ((closed_at IS NULL AND closed_by IS NULL AND counted IS NULL AND expected IS NULL AND difference IS NULL AND closing_reason IS NULL)
 OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted IS NOT NULL AND expected IS NOT NULL AND difference IS NOT NULL AND closing_reason IS NOT NULL AND counted>=0 AND difference=counted-expected))
);
CREATE INDEX cash_sessions_salon_id_opened_at_idx ON cash_sessions(salon_id,opened_at);
CREATE UNIQUE INDEX cash_session_one_open ON cash_sessions(salon_id) WHERE closed_at IS NULL;
CREATE TABLE cash_movements (
 id uuid PRIMARY KEY, salon_id uuid NOT NULL, session_id uuid NOT NULL, actor_id uuid NOT NULL,
 kind varchar(15) NOT NULL CHECK(kind IN ('PAYMENT','REFUND','WITHDRAWAL')), amount numeric(14,2) NOT NULL CHECK(amount>0),
 source_id uuid UNIQUE, reason varchar(500) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(salon_id,session_id) REFERENCES cash_sessions(salon_id,id), FOREIGN KEY(salon_id,actor_id) REFERENCES salon_users(salon_id,id)
);
CREATE INDEX cash_movements_salon_id_session_id_created_at_idx ON cash_movements(salon_id,session_id,created_at);
CREATE TRIGGER commission_basis_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON commission_bases FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE TRIGGER commission_entry_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON commission_entries FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE TRIGGER cash_movement_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON cash_movements FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE FUNCTION protect_closed_cash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Cash session is immutable'; END IF;
 IF NEW.id<>OLD.id OR NEW.salon_id<>OLD.salon_id OR NEW.opened_by<>OLD.opened_by OR NEW.opening<>OLD.opening OR NEW.opened_at<>OLD.opened_at THEN RAISE EXCEPTION 'Cash opening is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER closed_cash_immutable BEFORE UPDATE OR DELETE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION protect_closed_cash();
CREATE TRIGGER cash_session_no_truncate BEFORE TRUNCATE ON cash_sessions FOR EACH STATEMENT EXECUTE FUNCTION preserve_financial_entries();
CREATE FUNCTION check_cash_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM cash_sessions WHERE salon_id=NEW.salon_id AND id=NEW.session_id AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash session is closed'; END IF;
 IF NEW.kind='PAYMENT' AND NOT EXISTS(SELECT 1 FROM payments WHERE id=NEW.source_id AND salon_id=NEW.salon_id AND method='CASH' AND amount=NEW.amount) THEN RAISE EXCEPTION 'Invalid cash payment'; END IF;
 IF NEW.kind='REFUND' AND NOT EXISTS(SELECT 1 FROM payment_refunds r JOIN payments p ON p.id=r.payment_id AND p.salon_id=r.salon_id WHERE r.id=NEW.source_id AND r.salon_id=NEW.salon_id AND p.method='CASH' AND r.amount=NEW.amount) THEN RAISE EXCEPTION 'Invalid cash refund'; END IF;
 IF NEW.kind='WITHDRAWAL' AND (NEW.source_id IS NOT NULL OR length(trim(NEW.reason))<3) THEN RAISE EXCEPTION 'Invalid withdrawal'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER cash_movement_open BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION check_cash_movement();
INSERT INTO permissions(id,code,description) VALUES (gen_random_uuid(),'caixa.gerenciar','Gerenciar caixa') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='ROLE_ADMIN' AND r.protected AND p.code='caixa.gerenciar'
 ON CONFLICT DO NOTHING;
