#!/bin/bash
# Fetch all Chrome Extension API documentation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_LIST="$PROJECT_ROOT/docs/chrome-api/apis-to-download.txt"

echo "Fetching Chrome Extension API documentation..."
echo ""

# Read API list (skip comments and empty lines)
APIS=$(grep -v '^#' "$API_LIST" | grep -v '^$' | sort -u)

total=$(echo "$APIS" | wc -l)
current=0

for api in $APIS; do
  current=$((current + 1))
  echo "[$current/$total] Fetching $api..."

  # Run from project root so paths work correctly
  cd "$PROJECT_ROOT"
  "$SCRIPT_DIR/fetch-chrome-api.sh" "$api" 2>&1 | grep -E "(✓|Error)" || true

  echo ""
done

echo "=================="
echo "✓ All APIs fetched"
echo "=================="
echo ""
echo "Generated files:"
ls -lh "$PROJECT_ROOT/docs/chrome-api/"*.md | grep -v README | awk '{printf "  %s  %s\n", $9, $5}'
