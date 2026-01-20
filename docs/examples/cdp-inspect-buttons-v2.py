#!/usr/bin/env python3
"""
CDP Experiment: Find the 5 filter buttons and detect which is selected
"""

import json
import websocket

WS_URL = "ws://localhost:9222/devtools/page/0E9D730E52E29990D3C6F457E864598F"

def main():
    print("Connecting to hckrnews tab...")
    ws = websocket.create_connection(WS_URL)
    print("✓ Connected!\n")

    print("Finding the 5 filter buttons...\n")

    # Refined JavaScript to specifically target the filter buttons
    js_code = """
    (function() {
        // Find all elements with class 'filtertop' (the 5 buttons)
        const filterButtons = Array.from(document.querySelectorAll('.filtertop'));

        const buttons = filterButtons.map(el => {
            const styles = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            return {
                text: el.textContent.trim(),
                classes: Array.from(el.classList),
                position: {
                    top: Math.round(rect.top),
                    left: Math.round(rect.left)
                },
                styles: {
                    color: styles.color,
                    fontWeight: styles.fontWeight,
                    opacity: styles.opacity,
                    textDecoration: styles.textDecoration
                }
            };
        });

        // Sort by left position
        buttons.sort((a, b) => a.position.left - b.position.left);

        // Detect which one is selected by comparing colors
        // The selected one will have a different (lighter) color
        const colors = buttons.map(b => b.styles.color);
        const colorCounts = {};
        colors.forEach(c => colorCounts[c] = (colorCounts[c] || 0) + 1);

        // Find the color that appears less frequently (likely the selected one)
        const selectedColor = Object.entries(colorCounts)
            .sort((a, b) => a[1] - b[1])[0]?.[0];

        buttons.forEach(btn => {
            btn.isSelected = btn.styles.color === selectedColor;
        });

        return {
            count: buttons.length,
            buttons: buttons,
            colorCounts: colorCounts
        };
    })();
    """

    command = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": js_code,
            "returnByValue": True
        }
    }

    ws.send(json.dumps(command))
    response = ws.recv()
    response_data = json.loads(response)

    if "result" in response_data and "result" in response_data["result"]:
        result = response_data["result"]["result"]["value"]

        print("=" * 70)
        print(f"THE 5 FILTER BUTTONS (found {result['count']}):")
        print("=" * 70)

        for i, btn in enumerate(result['buttons'], 1):
            marker = " ← SELECTED ✓" if btn['isSelected'] else ""
            print(f"\n[{i}] {btn['text']}{marker}")
            print(f"    Classes: {', '.join(btn['classes'])}")
            print(f"    Color: {btn['styles']['color']}")
            print(f"    Position: left={btn['position']['left']}px")

        print("\n" + "=" * 70)
        print("ANSWER:")
        print("=" * 70)

        selected = [b for b in result['buttons'] if b['isSelected']]
        if selected:
            print(f"\n✓ The selected button is: '{selected[0]['text']}'")
            print(f"  Detected by: Different color ({selected[0]['styles']['color']})")
        else:
            print("\n⚠ Could not determine which button is selected")

        print(f"\nColor analysis: {result['colorCounts']}")

    ws.close()
    print("\nConnection closed.")

if __name__ == "__main__":
    main()
