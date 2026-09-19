#!/usr/bin/env bash
# No logs or backup contents are sent. Keep the ping URL in Actions Secrets.
set -euo pipefail

if [[ -z "${HEALTHCHECKS_PING_URL:-}" ]]; then
  echo 'Monitor externo não configurado; nenhum aviso enviado.'
  exit 0
fi

if [[ ! "$HEALTHCHECKS_PING_URL" =~ ^https://hc-ping\.com/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo 'ALERTA: endereço do monitor externo inválido.' >&2
  exit 1
fi

case "${WORKFLOW_RESULT:-}" in
  success) target="$HEALTHCHECKS_PING_URL" ;;
  failure|cancelled) target="$HEALTHCHECKS_PING_URL/fail" ;;
  *) echo 'ALERTA: resultado da execução inválido.' >&2; exit 1 ;;
esac

if ! response=$(curl --silent --fail --proto '=https' --connect-timeout 5 \
  --max-time 10 --retry 2 --retry-delay 2 --retry-max-time 35 "$target" 2>/dev/null); then
  echo 'ALERTA: não foi possível avisar o monitor externo.' >&2
  exit 1
fi

# Unknown/deleted checks may return HTTP 200 with "OK (not found)".
if [[ "$response" != 'OK' ]]; then
  echo 'ALERTA: monitor externo não confirmou o aviso.' >&2
  exit 1
fi
echo 'Monitor externo confirmou o recebimento do resultado.'
