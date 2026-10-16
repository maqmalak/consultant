#!/usr/bin/env bash
# Spec §16: API checks with curl as different users, proving that forbidden actions fail.
# Needs the demo data (setup/demo.py) and the site served on BASE (default http://127.0.0.1:8010, Host: consultant).
#   bash apps/pakistan_tax_consultancy/scripts/api_checks.sh
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8010}"
HOST="${HOST_HEADER:-consultant}"
DOMAIN="demo.taxportal.example"
PW="${DEMO_PASSWORD:-$(sed -n 's/^demo_password=//p' "$HOME/.consultant-demo-secrets" 2>/dev/null)}"
JAR_DIR="$(mktemp -d)"
trap 'rm -rf "$JAR_DIR"' EXIT
PASS=0
FAIL=0

login() {  # login <user-key>
  curl -s -o /dev/null -c "$JAR_DIR/$1" -H "Host: $HOST" -H "Content-Type: application/json" \
    -d "{\"usr\": \"$1@$DOMAIN\", \"pwd\": \"$PW\"}" "$BASE/api/method/login"
}

call() {  # call <user-key|guest> <GET|POST> <path> [json] -> prints HTTP status
  local jar=() data=()
  [ "$1" != "guest" ] && jar=(-b "$JAR_DIR/$1")
  [ -n "${4:-}" ] && data=(-H "Content-Type: application/json" -d "$4")
  curl -s -o "$JAR_DIR/body" -w "%{http_code}" -X "$2" "${jar[@]}" "${data[@]}" -H "Host: $HOST" "$BASE$3"
}

expect() {  # expect <description> <expected-status-regex> <actual>
  if [[ "$3" =~ ^($2)$ ]]; then PASS=$((PASS + 1)); printf "  ok    %-70s %s\n" "$1" "$3"
  else FAIL=$((FAIL + 1)); printf "  FAIL  %-70s got %s, want %s\n" "$1" "$3" "$2"; head -c 300 "$JAR_DIR/body"; echo; fi
}

body_has() { grep -q "$1" "$JAR_DIR/body"; }

for u in admin consultant consultant2 reviewer approver filing salaried company; do login "$u"; done

# names of demo records, read as the Tax Admin
call admin GET "/api/resource/Tax%20Return?fields=%5B%22name%22,%22client_name%22,%22tax_client%22%5D&limit_page_length=50" >/dev/null
SALARIED_CLIENT=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['data'];print(next(r['tax_client'] for r in d if r['client_name']=='Ahmed Raza'))" "$JAR_DIR/body")
SALARIED_RETURN=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['data'];print(next(r['name'] for r in d if r['client_name']=='Ahmed Raza'))" "$JAR_DIR/body")
COMPANY_RETURN=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['data'];print(next(r['name'] for r in d if r['client_name'].startswith('Demo Textiles')))" "$JAR_DIR/body")
call admin GET "/api/resource/Tax%20Document?filters=%5B%5B%22tax_return%22,%22=%22,%22$SALARIED_RETURN%22%5D%5D&limit_page_length=1" >/dev/null
SALARIED_DOC=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['data'][0]['name'])" "$JAR_DIR/body")
call admin GET "/api/resource/Payment%20Proof?limit_page_length=1" >/dev/null
PROOF=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['data'];print(d[0]['name'] if d else '')" "$JAR_DIR/body")
echo "returns: $SALARIED_RETURN (salaried, awaiting client) · $COMPANY_RETURN (company) · doc $SALARIED_DOC · proof $PROOF"

echo "Guest"
expect "guest cannot list clients" "403" "$(call guest GET '/api/resource/Tax%20Client')"
expect "guest cannot download a client document" "403" "$(call guest GET "/api/method/pakistan_tax_consultancy.api.portal.download?doctype=Tax%20Document&name=$SALARIED_DOC&fieldname=file")"
expect "guest cannot read the staff dashboard" "403" "$(call guest GET '/api/method/pakistan_tax_consultancy.api.staff.dashboard')"
expect "guest CAN use the public salary calculator" "200" "$(call guest GET '/api/method/pakistan_tax_consultancy.api.public.salary_calculator?monthly_salary=150000')"

echo "Client (salaried)"
expect "client cannot open another client's return" "403" "$(call salaried GET "/api/method/pakistan_tax_consultancy.api.portal.return_detail?tax_return=$COMPANY_RETURN")"
expect "client cannot read another client's return via REST" "403|404" "$(call salaried GET "/api/resource/Tax%20Return/$COMPANY_RETURN")"
call salaried GET '/api/resource/Tax%20Client?limit_page_length=50' >/dev/null
expect "client lists only their own client record" "1" "$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$JAR_DIR/body")"
call salaried GET '/api/resource/Tax%20Calculation' >/dev/null
expect "client sees no internal calculation records" "0" "$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1])).get('data',[])))" "$JAR_DIR/body" 2>/dev/null || echo 0)"
expect "client cannot verify payments" "403" "$(call salaried POST '/api/method/pakistan_tax_consultancy.api.staff.verify_payment' "{\"payment_proof\": \"$PROOF\", \"decision\": \"Verified\"}")"
expect "client cannot approve their own return" "403" "$(call salaried POST '/api/method/pakistan_tax_consultancy.api.staff.transition' "{\"tax_return\": \"$SALARIED_RETURN\", \"action\": \"Approve\"}")"
expect "client cannot jump the workflow by REST write" "403|417" "$(call salaried PUT "/api/resource/Tax%20Return/$SALARIED_RETURN" '{"workflow_state": "Approved"}')"
expect "client CAN read their own return" "200" "$(call salaried GET "/api/method/pakistan_tax_consultancy.api.portal.return_detail?tax_return=$SALARIED_RETURN")"

echo "Consultant 2 (not assigned to the demo clients)"
expect "unassigned consultant cannot read the return" "403" "$(call consultant2 GET "/api/resource/Tax%20Return/$SALARIED_RETURN")"
expect "unassigned consultant cannot open the client overview" "403" "$(call consultant2 GET "/api/method/pakistan_tax_consultancy.api.staff.client_overview?tax_client=$SALARIED_CLIENT")"

echo "Consultant (assigned)"
expect "consultant cannot approve (role)" "403" "$(call consultant POST '/api/method/pakistan_tax_consultancy.api.staff.transition' "{\"tax_return\": \"$SALARIED_RETURN\", \"action\": \"Approve\"}")"
expect "consultant cannot verify payments" "403" "$(call consultant POST '/api/method/pakistan_tax_consultancy.api.staff.verify_payment' "{\"payment_proof\": \"$PROOF\", \"decision\": \"Verified\"}")"
expect "consultant cannot record an acknowledgment" "403" "$(call consultant POST '/api/method/pakistan_tax_consultancy.api.staff.transition' "{\"tax_return\": \"$COMPANY_RETURN\", \"action\": \"Close\"}")"

echo "Approver"
expect "approver cannot approve before the client confirms" "417" "$(call approver POST '/api/method/pakistan_tax_consultancy.api.staff.transition' "{\"tax_return\": \"$SALARIED_RETURN\", \"action\": \"Approve\"}")"
body_has "not confirmed" && echo "        (server said: client has not confirmed)"

echo "Reviewer / filing officer"
expect "reviewer cannot verify payments" "403" "$(call reviewer POST '/api/method/pakistan_tax_consultancy.api.staff.verify_payment' "{\"payment_proof\": \"$PROOF\", \"decision\": \"Verified\"}")"
expect "filing officer cannot edit a filed return" "417|403" "$(call filing PUT "/api/resource/Tax%20Return/$COMPANY_RETURN" '{"refund_due": 1}')"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
