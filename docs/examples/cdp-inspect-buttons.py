#!/usr/bin/env python3
"""
CDP Experiment: Inspect hckrnews page to find buttons and determine which is selected
"""

import json
import websocket

# hckrnews tab WebSocket URL
WS_URL = "ws://localhost:9222/devtools/page/0E9D730E52E29990D3C6F457E864598F"

def pretty_print_json(label, data):
    """Pretty print JSON with a label"""
    print(f"\n{'='*70}")
    print(f"{label}")
    print(f"{'='*70}")
    print(json.dumps(data, indent=2))
    print(f"{'='*70}\n")

def main():
    print("Connecting to hckrnews tab...")
    ws = websocket.create_connection(WS_URL)
    print("✓ Connected!\n")

    print("Inspecting the DOM for buttons in top right corner...\n")

    # JavaScript code to inspect the page
    js_code = """
    (function() {
        // Strategy: Find buttons/links in the top right corner
        // Let's explore the page structure first

        // Look for common button patterns in navigation/header areas
        const candidates = [];

        // Try to find nav elements, header elements, or top-right positioned elements
        const allElements = document.querySelectorAll('a, button, [role="button"], [role="tab"]');

        // Get page dimensions to identify "top right"
        const pageWidth = document.documentElement.clientWidth;

        // Collect elements that might be in the top right (let's say right 40% and top 200px)
        for (const el of allElements) {
            const rect = el.getBoundingClientRect();

            // Top right heuristic: top < 200px and left > 60% of page width
            if (rect.top < 200 && rect.left > pageWidth * 0.6) {
                const isSelected = el.classList.contains('active') ||
                                   el.classList.contains('selected') ||
                                   el.getAttribute('aria-selected') === 'true' ||
                                   el.getAttribute('aria-current') === 'true' ||
                                   window.getComputedStyle(el).fontWeight === 'bold' ||
                                   window.getComputedStyle(el).fontWeight === '700';

                candidates.push({
                    text: el.textContent.trim(),
                    tag: el.tagName.toLowerCase(),
                    classes: Array.from(el.classList),
                    href: el.getAttribute('href'),
                    selected: isSelected,
                    position: {
                        top: Math.round(rect.top),
                        left: Math.round(rect.left),
                        right: Math.round(rect.right)
                    },
                    styles: {
                        fontWeight: window.getComputedStyle(el).fontWeight,
                        color: window.getComputedStyle(el).color,
                        textDecoration: window.getComputedStyle(el).textDecoration
                    }
                });
            }
        }

        // Sort by position (left to right)
        candidates.sort((a, b) => a.position.left - b.position.left);

        return {
            found: candidates.length,
            buttons: candidates,
            pageWidth: pageWidth
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

        print(f"Found {result['found']} button-like elements in top-right area\n")
        print(f"Page width: {result['pageWidth']}px\n")

        if result['buttons']:
            print("=" * 70)
            print("BUTTONS FOUND (left to right):")
            print("=" * 70)

            for i, btn in enumerate(result['buttons'], 1):
                selected_marker = " ← SELECTED" if btn['selected'] else ""
                print(f"\n[{i}] {btn['text']}{selected_marker}")
                print(f"    Tag: {btn['tag']}")
                print(f"    Classes: {btn['classes']}")
                if btn['href']:
                    print(f"    Href: {btn['href']}")
                print(f"    Position: left={btn['position']['left']}px, top={btn['position']['top']}px")
                print(f"    Font weight: {btn['styles']['fontWeight']}")
                print(f"    Color: {btn['styles']['color']}")
                print(f"    Selected: {btn['selected']}")

            print("\n" + "=" * 70)
            print("SUMMARY:")
            print("=" * 70)

            selected_buttons = [b for b in result['buttons'] if b['selected']]

            if selected_buttons:
                print(f"\n✓ Selected button: '{selected_buttons[0]['text']}'")
            else:
                print("\n⚠ No button appears to be selected (no 'active' class or bold styling detected)")
                print("  Buttons found:")
                for btn in result['buttons']:
                    print(f"    - {btn['text']}")
        else:
            print("No buttons found in top-right area. Let me try a broader search...\n")

            # Fallback: search more broadly
            js_code2 = """
            (function() {
                const all = Array.from(document.querySelectorAll('a, button'));
                return all.slice(0, 20).map(el => ({
                    text: el.textContent.trim().substring(0, 50),
                    tag: el.tagName,
                    classes: Array.from(el.classList)
                }));
            })();
            """

            command2 = {
                "id": 2,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": js_code2,
                    "returnByValue": True
                }
            }
            ws.send(json.dumps(command2))
            response2 = ws.recv()
            response_data2 = json.loads(response2)

            if "result" in response_data2:
                print("First 20 clickable elements found on page:")
                result2 = response_data2["result"]["result"]["value"]
                for el in result2:
                    print(f"  - {el['text']} ({el['tag']}) {el['classes']}")

    ws.close()
    print("\nConnection closed.")

if __name__ == "__main__":
    main()
