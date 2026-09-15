-- Composite foreign keys enforce actor ownership even when bypassing the API.
ALTER TABLE clients ADD CONSTRAINT clients_created_actor_fk FOREIGN KEY (salon_id, created_by) REFERENCES salon_users(salon_id, id) ON DELETE RESTRICT;
ALTER TABLE clients ADD CONSTRAINT clients_updated_actor_fk FOREIGN KEY (salon_id, updated_by) REFERENCES salon_users(salon_id, id) ON DELETE RESTRICT;
ALTER TABLE clients ADD CONSTRAINT clients_deleted_actor_fk FOREIGN KEY (salon_id, deleted_by) REFERENCES salon_users(salon_id, id) ON DELETE RESTRICT;
ALTER TABLE clients ADD CONSTRAINT clients_name_valid CHECK (length(trim(name)) >= 2);
ALTER TABLE clients ADD CONSTRAINT clients_version_valid CHECK (version > 0);
ALTER TABLE clients ADD CONSTRAINT clients_deletion_complete CHECK ((deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND length(trim(deletion_reason)) >= 5));
ALTER TABLE users ADD CONSTRAINT users_normalized_email CHECK (email = lower(trim(email)));
ALTER TABLE salon_users ADD CONSTRAINT salon_users_id_user_unique UNIQUE (id, user_id);
ALTER TABLE user_sessions ADD CONSTRAINT session_user_membership_fk FOREIGN KEY (membership_id, user_id) REFERENCES salon_users(id, user_id) ON DELETE RESTRICT;
ALTER TABLE user_sessions ADD CONSTRAINT session_expiry_valid CHECK (expires_at > created_at);

-- Append-only ledger. Production must ALSO use a runtime role without ownership/DDL privileges.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
