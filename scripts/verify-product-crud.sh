#!/usr/bin/env bash
set -euo pipefail

API_BASE="${MIF_API_URL:-https://mifordtalk-txy54ooe.manus.space/api/trpc/mif}"
TEST_NAME="MIF-CRUD-VERIFY-$(date +%s)"
PRODUCT_ID=""

json_string() {
  local key="$1"
  sed -nE "s/.*\"${key}\":\"([^\"]+)\".*/\1/p"
}

request() {
  curl --fail --silent --show-error --retry 3 --retry-all-errors "$@"
}

cleanup() {
  if [[ -n "$PRODUCT_ID" ]]; then
    request -X DELETE "${API_BASE}/api/products/${PRODUCT_ID}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN:-}" || true
  fi
}
trap cleanup EXIT

ADMIN_LOGIN="$(request -X POST "${API_BASE}/api/auth/login" -H "Content-Type: application/json" --data '{"loginId":"admin","password":"admin1234"}')"
ADMIN_TOKEN="$(printf '%s' "$ADMIN_LOGIN" | json_string token)"
[[ -n "$ADMIN_TOKEN" ]] || { echo "관리자 로그인 토큰을 확인하지 못했습니다." >&2; exit 1; }

CUSTOMER_LOGIN="$(request -X POST "${API_BASE}/api/auth/login" -H "Content-Type: application/json" --data '{"loginId":"mif","password":"@mif"}')"
CUSTOMER_TOKEN="$(printf '%s' "$CUSTOMER_LOGIN" | json_string token)"
[[ -n "$CUSTOMER_TOKEN" ]] || { echo "거래처 로그인 토큰을 확인하지 못했습니다." >&2; exit 1; }

CREATED="$(request -X POST "${API_BASE}/api/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  --data "{\"name\":\"${TEST_NAME}\",\"categoryName\":\"통합검증\",\"spec\":\"1박스\",\"unit\":\"박스\",\"basePrice\":12345,\"minOrderQty\":1,\"stockStatus\":\"in_stock\",\"isActive\":true,\"storageType\":\"room_temp\",\"description\":\"자동 통합 검증용 임시 상품\",\"detailImageKeys\":[],\"marketingBadges\":[]}")"
PRODUCT_ID="$(printf '%s' "$CREATED" | json_string id)"
[[ -n "$PRODUCT_ID" ]] || { echo "상품 생성 응답에서 ID를 확인하지 못했습니다." >&2; exit 1; }

CUSTOMER_AFTER_CREATE="$(request "${API_BASE}/api/sync/snapshot" -H "Authorization: Bearer ${CUSTOMER_TOKEN}")"
[[ "$CUSTOMER_AFTER_CREATE" == *"${TEST_NAME}"* ]] || { echo "신규 상품이 거래처 스냅샷에 없습니다." >&2; exit 1; }

UPDATED_NAME="${TEST_NAME}-수정"
request -X PATCH "${API_BASE}/api/products/${PRODUCT_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  --data "{\"name\":\"${UPDATED_NAME}\",\"stockStatus\":\"out_of_stock\",\"storageType\":\"frozen\",\"isActive\":true}" >/dev/null

CUSTOMER_AFTER_UPDATE="$(request "${API_BASE}/api/sync/snapshot" -H "Authorization: Bearer ${CUSTOMER_TOKEN}")"
[[ "$CUSTOMER_AFTER_UPDATE" == *"${UPDATED_NAME}"* ]] || { echo "수정 상품명이 거래처 스냅샷에 없습니다." >&2; exit 1; }
[[ "$CUSTOMER_AFTER_UPDATE" == *'"stockStatus":"out_of_stock"'* ]] || { echo "수정 재고 상태가 거래처 스냅샷에 없습니다." >&2; exit 1; }
[[ "$CUSTOMER_AFTER_UPDATE" == *'"storageType":"frozen"'* ]] || { echo "수정 보관 상태가 거래처 스냅샷에 없습니다." >&2; exit 1; }

DELETE_HEADERS="$(curl --fail --silent --show-error --retry 3 --retry-all-errors -D - -o /dev/null -X DELETE "${API_BASE}/api/products/${PRODUCT_ID}" -H "Authorization: Bearer ${ADMIN_TOKEN}")"
grep -qi '^x-mif-product-delete-mode: hard-delete-v2' <<< "$DELETE_HEADERS" || { echo "운영 API가 최신 하드 삭제 버전이 아닙니다." >&2; exit 1; }

CUSTOMER_AFTER_DELETE="$(request "${API_BASE}/api/sync/snapshot" -H "Authorization: Bearer ${CUSTOMER_TOKEN}")"
[[ "$CUSTOMER_AFTER_DELETE" != *"${UPDATED_NAME}"* ]] || { echo "삭제 상품이 거래처 스냅샷에 남아 있습니다." >&2; exit 1; }

ADMIN_AFTER_DELETE="$(request "${API_BASE}/api/sync/snapshot" -H "Authorization: Bearer ${ADMIN_TOKEN}")"
[[ "$ADMIN_AFTER_DELETE" != *"${UPDATED_NAME}"* ]] || { echo "삭제 상품이 관리자 스냅샷에 남아 있습니다." >&2; exit 1; }
PRODUCT_ID=""

echo "PASS: 관리자 상품 생성 → 거래처 노출 → 수정 동기화 → 관리자·거래처 목록에서 삭제 확인"
