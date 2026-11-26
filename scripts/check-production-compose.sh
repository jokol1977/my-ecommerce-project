#!/usr/bin/env bash
set -Eeuo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
compose_file="$project_dir/compose.yaml"
env_file=${1:-"$project_dir/.env.production"}

if [[ "$env_file" != /* ]]; then
  env_file="$project_dir/$env_file"
fi

errors=0

if [[ -L "$env_file" || ! -f "$env_file" ]]; then
  printf '[BLOCKED] .env.production is missing, is not a regular file, or is a symbolic link.\n' >&2
  exit 1
fi

if ! mode=$(stat -c '%a' -- "$env_file" 2>/dev/null); then
  printf '[BLOCKED] Could not inspect .env.production permissions.\n' >&2
  exit 1
fi
if [[ "$mode" != "600" && "$mode" != "400" ]]; then
  printf '[BLOCKED] Restrict .env.production permissions to 600 (or read-only 400) before continuing.\n' >&2
  errors=1
fi

declare -A env_values=()
declare -A seen_keys=()
line_number=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_number=$((line_number + 1))
  line=${line%$'\r'}
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  if [[ ! "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    printf '[BLOCKED] Unsupported .env.production syntax at line %d; use KEY=value entries without spaces.\n' "$line_number" >&2
    errors=1
    continue
  fi

  key=${BASH_REMATCH[1]}
  value=${BASH_REMATCH[2]}
  if [[ "$value" =~ [[:space:]] ]]; then
    printf '[BLOCKED] %s contains whitespace; use the documented URL-safe, unquoted format.\n' "$key" >&2
    errors=1
    continue
  fi
  if [[ -n "${seen_keys[$key]+present}" ]]; then
    printf '[BLOCKED] %s appears more than once in .env.production.\n' "$key" >&2
    errors=1
    continue
  fi
  seen_keys[$key]=1
  env_values[$key]=$value
done < "$env_file"

required_keys=(
  POSTGRES_PASSWORD APP_DB_PASSWORD MIGRATOR_DB_PASSWORD
  DATABASE_URL DIRECT_URL AUTH_URL AUTH_SECRET RATE_LIMIT_SECRET CRON_SECRET
  REDIS_PASSWORD REDIS_URL
)
for key in "${required_keys[@]}"; do
  value=${env_values[$key]-}
  value_lower=${value,,}
  if [[ -z "$value" || "$value_lower" == replace_with_* || "$value_lower" == change_this_* || "$value_lower" == your_* ]]; then
    printf '[BLOCKED] %s is missing or still contains an example placeholder.\n' "$key" >&2
    errors=1
  fi
done

auth_login=${env_values[AUTH_LOGIN_ENABLED]-false}
if [[ -z "$auth_login" ]]; then auth_login=false; fi
if [[ "$auth_login" != "true" && "$auth_login" != "false" ]]; then
  printf '[BLOCKED] AUTH_LOGIN_ENABLED must be exactly true or false.\n' >&2
  errors=1
elif [[ "$auth_login" == "true" ]]; then
  auth_keys=(SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_SECURE EMAIL_FROM AUTH_MFA_ENCRYPTION_KEY)
  for key in "${auth_keys[@]}"; do
    value=${env_values[$key]-}
    value_lower=${value,,}
    if [[ -z "$value" || "$value_lower" == replace_with_* || "$value_lower" == change_this_* || "$value_lower" == your_* ]]; then
      printf '[BLOCKED] AUTH_LOGIN_ENABLED is true but %s is missing or still contains an example placeholder.\n' "$key" >&2
      errors=1
    fi
  done

  smtp_host=${env_values[SMTP_HOST]-}
  smtp_host_lower=${smtp_host,,}
  if [[ -n "$smtp_host" && ( ! "$smtp_host" =~ ^[A-Za-z0-9.-]+$ || "$smtp_host_lower" == *.example.ir || "$smtp_host_lower" == *.example.com || "$smtp_host_lower" == "invalid" || "$smtp_host_lower" == *.invalid ) ]]; then
    printf '[BLOCKED] SMTP_HOST must be a real SMTP hostname.\n' >&2
    errors=1
  fi

  smtp_port=${env_values[SMTP_PORT]-}
  if [[ -n "$smtp_port" ]]; then
    if [[ ! "$smtp_port" =~ ^[0-9]{1,5}$ ]] || ((10#$smtp_port < 1 || 10#$smtp_port > 65535)); then
      printf '[BLOCKED] SMTP_PORT must be a port between 1 and 65535.\n' >&2
      errors=1
    fi
  fi

  smtp_secure=${env_values[SMTP_SECURE]-}
  if [[ -n "$smtp_secure" && "$smtp_secure" != "true" && "$smtp_secure" != "false" ]]; then
    printf '[BLOCKED] SMTP_SECURE must be exactly true or false.\n' >&2
    errors=1
  fi

  email_from=${env_values[EMAIL_FROM]-}
  email_from_lower=${email_from,,}
  email_from_domain=${email_from_lower##*@}
  if [[ -n "$email_from" && ( ! "$email_from" =~ ^[^@[:space:]\<\>]+@[^@[:space:]\<\>]+\.[^@[:space:]\<\>]+$ || \
    "$email_from_lower" == *replace_with_* || "$email_from_lower" == *change_this_* || "$email_from_lower" == *your_* || \
    "$email_from_domain" == "example.com" || "$email_from_domain" == *.example.com || \
    "$email_from_domain" == "example.ir" || "$email_from_domain" == *.example.ir || \
    "$email_from_domain" == "invalid" || "$email_from_domain" == *.invalid ) ]]; then
    printf '[BLOCKED] EMAIL_FROM must be a real sender email address without display-name spaces.\n' >&2
    errors=1
  fi

  mfa_key=${env_values[AUTH_MFA_ENCRYPTION_KEY]-}
  if [[ -n "$mfa_key" && ! "$mfa_key" =~ ^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$ ]]; then
    printf '[BLOCKED] AUTH_MFA_ENCRYPTION_KEY must be a canonical 32-byte base64url value.\n' >&2
    errors=1
  fi

  bootstrap_secret=${env_values[AUTH_ADMIN_MFA_ENROLLMENT_SECRET]-}
  if [[ -n "$bootstrap_secret" ]]; then
    bootstrap_secret_lower=${bootstrap_secret,,}
    if [[ "$bootstrap_secret_lower" == replace_with_* || "$bootstrap_secret_lower" == change_this_* || "$bootstrap_secret_lower" == your_* || ${#bootstrap_secret} -lt 32 ]]; then
      printf '[BLOCKED] AUTH_ADMIN_MFA_ENROLLMENT_SECRET must be a real value of at least 32 characters when present.\n' >&2
      errors=1
    fi
  fi
fi

checkout_gate=${env_values[MARKETPLACE_LIVE_CHECKOUT_ENABLED]-false}
if [[ -z "$checkout_gate" ]]; then checkout_gate=false; fi
if [[ "$checkout_gate" != "true" && "$checkout_gate" != "false" ]]; then
  printf '[BLOCKED] MARKETPLACE_LIVE_CHECKOUT_ENABLED must be exactly true or false.\n' >&2
  errors=1
fi
if [[ "$checkout_gate" == "true" ]]; then
  printf '[BLOCKED] MARKETPLACE_LIVE_CHECKOUT_ENABLED must remain false until marketplace authorization, refunds, settlement, reconciliation, and a limited pilot are verified.\n' >&2
  errors=1
fi

vendor_gate=${env_values[VENDOR_APPROVAL_ENABLED]-false}
if [[ -z "$vendor_gate" ]]; then vendor_gate=false; fi
if [[ "$vendor_gate" != "true" && "$vendor_gate" != "false" ]]; then
  printf '[BLOCKED] VENDOR_APPROVAL_ENABLED must be exactly true or false.\n' >&2
  errors=1
fi
if [[ "$vendor_gate" == "true" ]]; then
  printf '[BLOCKED] VENDOR_APPROVAL_ENABLED must remain false until the final agreement and secure identity-review process are ready.\n' >&2
  errors=1

  agreement_version=${env_values[VENDOR_AGREEMENT_VERSION]-}
  agreement_sha256=${env_values[VENDOR_AGREEMENT_SHA256]-}
  if [[ ! "$agreement_version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$ ]]; then
    printf '[BLOCKED] VENDOR_APPROVAL_ENABLED=true requires a valid VENDOR_AGREEMENT_VERSION.\n' >&2
    errors=1
  elif [[ ! "$agreement_sha256" =~ ^[A-Fa-f0-9]{64}$ ]]; then
    printf '[BLOCKED] VENDOR_APPROVAL_ENABLED=true requires a 64-character VENDOR_AGREEMENT_SHA256.\n' >&2
    errors=1
  else
    agreement_file="$project_dir/public/legal/vendor-agreements/$agreement_version.pdf"
    if [[ ! -f "$agreement_file" ]] || [[ "$(sha256sum "$agreement_file" | awk '{print $1}')" != "${agreement_sha256,,}" ]]; then
      printf '[BLOCKED] The configured vendor-agreement PDF is missing or its SHA-256 does not match.\n' >&2
      errors=1
    fi
  fi
fi

if [[ "$auth_login" != "true" && "$checkout_gate" == "true" ]]; then
  printf '[BLOCKED] Live checkout requires AUTH_LOGIN_ENABLED=true so customers can authenticate.\n' >&2
  errors=1
fi
if [[ "$auth_login" != "true" && "$vendor_gate" == "true" ]]; then
  printf '[BLOCKED] Vendor approval requires AUTH_LOGIN_ENABLED=true so applicants can authenticate.\n' >&2
  errors=1
fi

zarinpal_mode=${env_values[ZARINPAL_MODE]-disabled}
if [[ -z "$zarinpal_mode" ]]; then zarinpal_mode=disabled; fi
case "$zarinpal_mode" in
  disabled)
    if [[ "$checkout_gate" == "true" ]]; then
      printf '[BLOCKED] Live checkout cannot be enabled while ZARINPAL_MODE is disabled.\n' >&2
      errors=1
    fi
    ;;
  production)
    zarinpal_merchant_id=${env_values[ZARINPAL_MERCHANT_ID]-}
    if [[ ! "$zarinpal_merchant_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
      printf '[BLOCKED] ZARINPAL_MERCHANT_ID must be a valid merchant UUID when production mode is selected.\n' >&2
      errors=1
    fi
    ;;
  sandbox)
    printf '[BLOCKED] ZARINPAL_MODE=sandbox is not valid in the production Compose configuration.\n' >&2
    errors=1
    ;;
  *)
    printf '[BLOCKED] ZARINPAL_MODE must be disabled or production in the production Compose configuration.\n' >&2
    errors=1
    ;;
esac

sms_provider=${env_values[SMS_PROVIDER]-disabled}
if [[ -z "$sms_provider" ]]; then sms_provider=disabled; fi
case "$sms_provider" in
  disabled) ;;
  kavenegar)
    for key in KAVENEGAR_API_KEY KAVENEGAR_SENDER; do
      value=${env_values[$key]-}
      value_lower=${value,,}
      if [[ -z "$value" || "$value_lower" == replace_with_* || "$value_lower" == change_this_* || "$value_lower" == your_* ]]; then
        printf '[BLOCKED] SMS_PROVIDER=kavenegar requires a real %s value.\n' "$key" >&2
        errors=1
      fi
    done
    ;;
  *)
    printf '[BLOCKED] SMS_PROVIDER must be disabled or kavenegar.\n' >&2
    errors=1
    ;;
esac

secret_keys=(
  POSTGRES_PASSWORD APP_DB_PASSWORD MIGRATOR_DB_PASSWORD REDIS_PASSWORD
  AUTH_SECRET RATE_LIMIT_SECRET CRON_SECRET
)
for key in "${secret_keys[@]}"; do
  value=${env_values[$key]-}
  if [[ -n "$value" && ! "$value" =~ ^[A-Za-z0-9_-]{32,}$ ]]; then
    printf '[BLOCKED] %s must be at least 32 characters and URL-safe (letters, numbers, underscore, or hyphen).\n' "$key" >&2
    errors=1
  fi
done

auth_secret=${env_values[AUTH_SECRET]-}
if (( ${#auth_secret} > 256 )); then
  printf '[BLOCKED] AUTH_SECRET must not exceed 256 URL-safe characters.\n' >&2
  errors=1
fi

for ((i = 0; i < ${#secret_keys[@]}; i++)); do
  left_key=${secret_keys[$i]}
  left_value=${env_values[$left_key]-}
  [[ -n "$left_value" ]] || continue
  for ((j = i + 1; j < ${#secret_keys[@]}; j++)); do
    right_key=${secret_keys[$j]}
    right_value=${env_values[$right_key]-}
    if [[ -n "$right_value" && "$left_value" == "$right_value" ]]; then
      printf '[BLOCKED] Secret values must be unique; %s and %s currently match.\n' "$left_key" "$right_key" >&2
      errors=1
    fi
  done
done

if [[ -n "${env_values[APP_DB_PASSWORD]-}" && -n "${env_values[DATABASE_URL]-}" ]]; then
  expected="postgresql://janan_app:${env_values[APP_DB_PASSWORD]}@database:5432/janankadeh?schema=public"
  if [[ "${env_values[DATABASE_URL]}" != "$expected" ]]; then
    printf '[BLOCKED] DATABASE_URL must use APP_DB_PASSWORD and the Compose database service.\n' >&2
    errors=1
  fi
fi

if [[ -n "${env_values[MIGRATOR_DB_PASSWORD]-}" && -n "${env_values[DIRECT_URL]-}" ]]; then
  expected="postgresql://janan_migrator:${env_values[MIGRATOR_DB_PASSWORD]}@database:5432/janankadeh?schema=public"
  if [[ "${env_values[DIRECT_URL]}" != "$expected" ]]; then
    printf '[BLOCKED] DIRECT_URL must use MIGRATOR_DB_PASSWORD and the Compose database service.\n' >&2
    errors=1
  fi
fi

if [[ -n "${env_values[REDIS_PASSWORD]-}" && -n "${env_values[REDIS_URL]-}" ]]; then
  expected="redis://:${env_values[REDIS_PASSWORD]}@redis:6379/0"
  if [[ "${env_values[REDIS_URL]}" != "$expected" ]]; then
    printf '[BLOCKED] REDIS_URL must use REDIS_PASSWORD and the Compose Redis service.\n' >&2
    errors=1
  fi
fi

auth_url=${env_values[AUTH_URL]-}
if [[ -n "$auth_url" ]]; then
  if [[ ! "$auth_url" =~ ^https://[A-Za-z0-9][A-Za-z0-9.-]*(:([0-9]{1,5}))?$ ]]; then
    printf '[BLOCKED] AUTH_URL must be an HTTPS origin without a path, query, or fragment.\n' >&2
    errors=1
  elif [[ -n "${BASH_REMATCH[2]-}" ]] && ((10#${BASH_REMATCH[2]} < 1 || 10#${BASH_REMATCH[2]} > 65535)); then
    printf '[BLOCKED] AUTH_URL port must be between 1 and 65535.\n' >&2
    errors=1
  fi
fi

app_port=${env_values[APP_PORT]-3000}
if [[ -z "$app_port" ]]; then app_port=3000; fi
if [[ "$app_port" != "3000" ]]; then
  printf '[BLOCKED] APP_PORT must remain 3000 to match the Nginx upstream and host-side helper.\n' >&2
  errors=1
fi

if [[ ! -f "$compose_file" ]]; then
  printf '[BLOCKED] compose.yaml is missing from the project root.\n' >&2
  exit 1
fi

if (( errors != 0 )); then
  printf '\nResolve the listed configuration issues; no secret values were displayed.\n' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf '[BLOCKED] Docker CLI with the Compose plugin is required for this configuration check.\n' >&2
  exit 1
fi

if ! docker compose \
  --project-directory "$project_dir" \
  --project-name janankadeh \
  --env-file "$env_file" \
  --file "$compose_file" \
  config --quiet >/dev/null 2>&1; then
  printf '[BLOCKED] Docker Compose rejected the configuration; review required keys and Compose syntax. Secret values were suppressed.\n' >&2
  exit 1
fi

printf '[OK] .env.production permissions, required settings, secret alignment, and Compose interpolation are valid.\n'
printf '[OK] This check did not start containers, pull images, or modify databases or volumes.\n'

image_limit=${env_values[PRODUCT_IMAGE_VOLUME_LIMIT_BYTES]-}
image_reserve=${env_values[PRODUCT_IMAGE_VOLUME_MIN_FREE_BYTES]-}
if [[ ! "$image_limit" =~ ^[1-9][0-9]*$ || ! "$image_reserve" =~ ^[1-9][0-9]*$ ]]; then
  printf '[INFO] Product image uploads remain fail-closed until both volume limits are set to measured positive byte counts.\n'
fi

printf '[INFO] Compose configuration validation is not a production deployment or go-live approval.\n'
