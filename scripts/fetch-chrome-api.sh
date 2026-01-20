#!/bin/bash
# fetch-chrome-api.sh - Final production script using MCP with proper cleaning

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <api-name> [output-file]"
  echo ""
  echo "Fetches Chrome API documentation using the MCP server with automatic cleaning"
  echo ""
  echo "Examples:"
  echo "  $0 runtime                      # Saves to docs/chrome-api/runtime.md"
  echo "  $0 tabs custom/path/tabs.md     # Custom output path"
  exit 1
fi

API_NAME="$1"
# Convert dots to slashes for nested APIs (e.g., devtools.panels -> devtools/panels)
URL_PATH="${API_NAME//.//}"
URL="https://developer.chrome.com/docs/extensions/reference/api/${URL_PATH}"

# Set output file
if [ -n "${2:-}" ]; then
  OUTPUT="$2"
else
  OUTPUT="docs/chrome-api/${API_NAME}.md"
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"

echo "Fetching: $URL"
echo "Using MCP server for clean markdown conversion..."

# Use MCP CLI to fetch
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/mcp-fetch-cli.js" "$URL" "$OUTPUT.tmp"

# Post-process to remove CSS and clean up
awk '
BEGIN { in_css = 0; skip_until_desc = 1 }

# Skip everything until we hit the actual content
# Match headings like "Description", "##", or various language versions
/^Description[[:space:]]*$/ || /^##[[:space:]]/ || /^Beschreibung[[:space:]]*$/ { skip_until_desc = 0 }
skip_until_desc { next }

# Detect and skip CSS blocks
/^\.dcc-/ || /^====/ { in_css = 1; next }
in_css && /^[a-z]/ { next }
in_css && /^$/ { in_css = 0; next }
in_css { next }

# Skip JSON-LD schema blocks
/@context.*schema\.org/ { next }

# Skip long separator lines
/^={50,}/ { next }

# Print everything else
!in_css && !skip_until_desc { print }
' "$OUTPUT.tmp" > "$OUTPUT.cleaned"

# Add proper header
cat > "$OUTPUT" << EOF
# chrome.${API_NAME}

**Source:** https://developer.chrome.com/docs/extensions/reference/api/${API_NAME}

---

EOF

# Append cleaned content
cat "$OUTPUT.cleaned" >> "$OUTPUT"

# Cleanup temp files
rm -f "$OUTPUT.tmp" "$OUTPUT.cleaned"

SIZE=$(wc -c < "$OUTPUT")
LINES=$(wc -l < "$OUTPUT")

echo "✓ Successfully saved to $OUTPUT"
echo "  Size: $SIZE bytes"
echo "  Lines: $LINES"
echo ""
echo "First 10 lines:"
head -10 "$OUTPUT" | sed 's/^/  /'
