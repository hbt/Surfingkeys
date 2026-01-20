#!/bin/bash
# Trigger extension reload via keyboard shortcut

echo "Triggering Alt+Shift+R to reload extension..."
xdotool key alt+shift+r

echo "✓ Reload triggered"
echo ""
echo "Check service worker console for logs:"
echo "  chrome://extensions/ → Surfingkeys → 'service worker' link"
echo ""
echo "Expected output:"
echo "  [COMMAND RECEIVED] restartext"
echo "  [RESTARTEXT] Reloading extension in 2 seconds..."
echo "  [RESTARTEXT] Reloading X tabs"
echo "  [RESTARTEXT] Extension reload in 2s (check console!)"
echo "  [RESTARTEXT] Reloading NOW"
