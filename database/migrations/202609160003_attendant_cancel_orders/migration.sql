-- Existing Atendente roles gain the same cancellation permission as new salons.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'ROLE_ATENDENTE'
  AND p.code = 'comandas.cancelar'
ON CONFLICT DO NOTHING;
