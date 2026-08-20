#!/usr/bin/env bash
set -euo pipefail

API_BASE="${MIF_API_URL:-https://mifordtalk-txy54ooe.manus.space/api/trpc/mif}"
NAME="MIF-DELETE-HEADER-DEBUG-$(date +%s)"
TOKEN="$(curl --fail --silent --show-error -X POST "${API_BASE}/api/auth/login" -H "Content-Type: application/json" --data '{"loginId":"admin","password":"admin1234"}' | sed -nE 's/.*"token":"([^"]+)".*/\1/p')"
[[ -n "$TOKEN" ]] || { echo "관리자 로그인 실패" >&2; exit 1; }
PRODUCT="$(curl --fail --silent --show-error -X POST "${API_BASE}/api/products" -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" --data "{\"name\":\"${NAME}\",\"categoryName\":\"통합검증\",\"spec\":\"1개\",\"unit\":\"개\",\"basePrice\":1000,\"minOrderQty\":1}")"
PRODUCT_ID="$(printf '%s' "$PRODUCT" | sed -nE 's/.*"id":"([^"]+)".*/\1/p')"
[[ -n "$PRODUCT_ID" ]] || { echo "상품 생성 실패" >&2; exit 1; }

curl --silent --show-error --dump-header - --output /dev/null -X DELETE "${API_BASE}/api/products/${PRODUCT_ID}" -H "Authorization: Bearer ${TOKEN}"
