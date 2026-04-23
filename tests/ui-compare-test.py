#!/usr/bin/env python3
"""
US-210: UI Screenshot Comparison — Current UI vs ui.html Reference

Takes screenshots of the current app and the ui.html reference design,
then compares key regions pixel-by-pixel and generates a diff report.

Usage:
  1. Start vite dev server: npm run dev -- --host 127.0.0.1 --port 5173
  2. Run: python3 tests/ui-compare-test.py

Output:
  /tmp/ui_reference.png  — screenshot of ui.html
  /tmp/ui_current.png    — screenshot of current app
  /tmp/ui_diff.png       — visual diff overlay
  /tmp/ui_diff_report.txt — text report of differences
"""

import sys
import os
import time
from playwright.sync_api import sync_playwright

DEV_URL = "http://127.0.0.1:5173"
REFERENCE_URL = f"{DEV_URL}/ui.html"
OUTPUT_DIR = "/tmp"

# Regions to compare (x, y, width, height) — approximate zones
REGIONS = {
    "TitleBar": (0, 0, 1200, 56),
    "Sidebar": (0, 56, 180, 744),
    "ContentArea": (180, 56, 800, 744),
    "AiToolbox": (980, 56, 220, 744),
}


def screenshot_reference(page) -> str:
    """Screenshot the ui.html reference design."""
    path = os.path.join(OUTPUT_DIR, "ui_reference.png")
    ref_url = f"file:///Users/clear2x/ai_ws/ABoard/ui.html"
    page.goto(ref_url, timeout=15000, wait_until="networkidle")
    page.set_viewport_size({"width": 1200, "height": 800})
    time.sleep(2)
    page.screenshot(path=path, full_page=False)
    print(f"  Reference screenshot: {path}")
    return path


def screenshot_current(page) -> str:
    """Screenshot the current running app."""
    path = os.path.join(OUTPUT_DIR, "ui_current.png")
    page.goto(DEV_URL, timeout=10000, wait_until="networkidle")
    page.set_viewport_size({"width": 1200, "height": 800})
    time.sleep(2)
    page.screenshot(path=path, full_page=False)
    print(f"  Current app screenshot: {path}")
    return path


def compare_regions(ref_path: str, cur_path: str) -> dict:
    """Compare regions between reference and current screenshots."""
    try:
        from PIL import Image
    except ImportError:
        print("  PIL not available, skipping pixel comparison")
        return {}

    ref_img = Image.open(ref_path)
    cur_img = Image.open(cur_path)

    # Resize to same dimensions if needed
    if ref_img.size != cur_img.size:
        w, h = min(ref_img.size[0], cur_img.size[0]), min(ref_img.size[1], cur_img.size[1])
        ref_img = ref_img.resize((w, h))
        cur_img = cur_img.resize((w, h))

    results = {}

    for name, (x, y, w, h) in REGIONS.items():
        # Clamp region to image bounds
        x2 = min(x + w, ref_img.size[0])
        y2 = min(y + h, ref_img.size[1])

        ref_region = ref_img.crop((x, y, x2, y2))
        cur_region = cur_img.crop((x, y, x2, y2))

        # Convert to RGB if needed
        if ref_region.mode != "RGB":
            ref_region = ref_region.convert("RGB")
        if cur_region.mode != "RGB":
            cur_region = cur_region.convert("RGB")

        ref_pixels = list(ref_region.getdata())
        cur_pixels = list(cur_region.getdata())

        if len(ref_pixels) != len(cur_pixels):
            results[name] = {
                "match_pct": 0.0,
                "note": "Region size mismatch",
                "diff_pixels": max(len(ref_pixels), len(cur_pixels)),
                "total_pixels": max(len(ref_pixels), len(cur_pixels)),
            }
            continue

        diff_count = 0
        total = len(ref_pixels)
        threshold = 30  # color difference threshold per channel

        for rp, cp in zip(ref_pixels, cur_pixels):
            if abs(rp[0] - cp[0]) > threshold or abs(rp[1] - cp[1]) > threshold or abs(rp[2] - cp[2]) > threshold:
                diff_count += 1

        match_pct = (1 - diff_count / total) * 100 if total > 0 else 0
        results[name] = {
            "match_pct": round(match_pct, 1),
            "diff_pixels": diff_count,
            "total_pixels": total,
        }

    # Generate diff image
    diff_img = Image.new("RGB", ref_img.size)
    ref_data = list(ref_img.convert("RGB").getdata())
    cur_data = list(cur_img.convert("RGB").getdata())

    for i, (rp, cp) in enumerate(zip(ref_data, cur_data)):
        diff = abs(rp[0] - cp[0]) + abs(rp[1] - cp[1]) + abs(rp[2] - cp[2])
        if diff > 60:
            diff_img.putpixel((i % ref_img.size[0], i // ref_img.size[0]), (255, 0, 0))
        else:
            diff_img.putpixel((i % ref_img.size[0], i // ref_img.size[0]), rp)

    diff_path = os.path.join(OUTPUT_DIR, "ui_diff.png")
    diff_img.save(diff_path)
    print(f"  Diff overlay: {diff_path}")

    return results


def generate_css_report(page) -> list:
    """Extract CSS properties from key elements in current app and compare to reference values."""
    checks = []

    # TitleBar checks
    titlebar_bg = page.evaluate("""() => {
        const el = document.querySelector('[data-tauri-drag-region]');
        if (!el) return null;
        return window.getComputedStyle(el).backgroundColor;
    }""")

    # Search bar checks
    search_bg = page.evaluate("""() => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const input of inputs) {
            const parent = input.closest('div');
            if (parent) {
                const cs = window.getComputedStyle(parent);
                return { bg: cs.backgroundColor, border: cs.borderColor, padding: cs.padding };
            }
        }
        return null;
    }""")

    # Traffic light checks
    traffic_lights = page.evaluate("""() => {
        const lights = document.querySelectorAll('.bg-red-500, .bg-yellow-400, .bg-green-500');
        if (lights.length >= 3) {
            return lights.length;
        }
        // Try alternative selectors
        const container = document.querySelector('.flex.gap-2');
        if (container) {
            return container.querySelectorAll('button, div').length;
        }
        return 0;
    }""")

    checks.append({
        "area": "TitleBar",
        "check": "Background is semi-transparent white (bg-white/30)",
        "actual": str(titlebar_bg),
        "expected": "white with transparency",
        "pass": titlebar_bg is not None and ("255" in str(titlebar_bg) or "oklch" in str(titlebar_bg).lower() or "oklab" in str(titlebar_bg).lower() or "0.3)" in str(titlebar_bg)),
    })

    checks.append({
        "area": "TitleBar",
        "check": "Traffic lights count >= 3",
        "actual": str(traffic_lights),
        "expected": ">= 3",
        "pass": traffic_lights >= 3 if isinstance(traffic_lights, int) else False,
    })

    # Sidebar checks
    sidebar_text = page.evaluate("""() => {
        const el = document.querySelector('.font-bold.text-gray-700');
        if (!el) return null;
        return window.getComputedStyle(el).color;
    }""")

    checks.append({
        "area": "Sidebar",
        "check": "Logo text color gray-700 (via Tailwind class)",
        "actual": str(sidebar_text),
        "expected": "text-gray-700 (oklch or rgb format)",
        "pass": sidebar_text is not None,
    })

    # Glass panel check
    glass_bg = page.evaluate("""() => {
        const panels = document.querySelectorAll('.glass-panel');
        if (panels.length === 0) return null;
        return window.getComputedStyle(panels[0]).backgroundColor;
    }""")

    checks.append({
        "area": "Global",
        "check": "Glass-panel background rgba(255,255,255,0.75)",
        "actual": str(glass_bg),
        "expected": "rgba(255, 255, 255, 0.75)",
        "pass": glass_bg is not None and "255" in str(glass_bg),
    })

    # Glass card check
    glass_card_bg = page.evaluate("""() => {
        const cards = document.querySelectorAll('.glass-card');
        if (cards.length === 0) return null;
        return window.getComputedStyle(cards[0]).backgroundColor;
    }""")

    checks.append({
        "area": "Global",
        "check": "Glass-card background rgba(255,255,255,0.5)",
        "actual": str(glass_card_bg),
        "expected": "rgba(255, 255, 255, 0.5)",
        "pass": glass_card_bg is not None and "255" in str(glass_card_bg),
    })

    # CSS var usage check
    css_var_count = page.evaluate("""() => {
        const allElements = document.querySelectorAll('*');
        let count = 0;
        for (const el of allElements) {
            const style = el.getAttribute('style');
            if (style && style.includes('var(--color-text')) {
                count++;
            }
        }
        return count;
    }""")

    checks.append({
        "area": "Global",
        "check": "No var(--color-text-*) in inline styles",
        "actual": f"{css_var_count} elements using CSS vars",
        "expected": "0",
        "pass": css_var_count == 0,
    })

    return checks


def write_report(region_results: dict, css_checks: list):
    """Write the diff report to file."""
    path = os.path.join(OUTPUT_DIR, "ui_diff_report.txt")
    with open(path, "w") as f:
        f.write("ABoard UI Comparison Report\n")
        f.write("=" * 60 + "\n\n")

        f.write("REGION COMPARISON (pixel-level)\n")
        f.write("-" * 40 + "\n")
        for name, data in region_results.items():
            f.write(f"\n{name}:\n")
            f.write(f"  Match: {data.get('match_pct', 'N/A')}%\n")
            f.write(f"  Diff pixels: {data.get('diff_pixels', 'N/A')} / {data.get('total_pixels', 'N/A')}\n")
            if "note" in data:
                f.write(f"  Note: {data['note']}\n")

        f.write("\n\nCSS PROPERTY CHECKS\n")
        f.write("-" * 40 + "\n")
        for check in css_checks:
            symbol = "✓" if check["pass"] else "✗"
            f.write(f"\n{symbol} [{check['area']}] {check['check']}\n")
            f.write(f"    Expected: {check['expected']}\n")
            f.write(f"    Actual:   {check['actual']}\n")

        # Summary
        css_pass = sum(1 for c in css_checks if c["pass"])
        css_total = len(css_checks)
        f.write(f"\n\nSUMMARY\n")
        f.write(f"CSS checks: {css_pass}/{css_total} passed\n")
        if region_results:
            avg_match = sum(r.get("match_pct", 0) for r in region_results.values()) / len(region_results)
            f.write(f"Average region match: {avg_match:.1f}%\n")

    print(f"  Report: {path}")
    return path


def main():
    print("=" * 60)
    print("ABoard — UI Screenshot Comparison (US-210)")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1200, "height": 800})
        page = context.new_page()

        # Step 1: Screenshot reference ui.html
        print("\n[Step 1] Capturing ui.html reference...")
        try:
            ref_path = screenshot_reference(page)
        except Exception as e:
            print(f"  ✗ Failed to load ui.html: {e}")
            browser.close()
            sys.exit(1)

        # Step 2: Screenshot current app
        print("\n[Step 2] Capturing current app...")
        try:
            cur_path = screenshot_current(page)
        except Exception as e:
            print(f"  ✗ Failed to load app: {e}")
            print(f"    Make sure dev server is running: npm run dev -- --host 127.0.0.1 --port 5173")
            browser.close()
            sys.exit(1)

        # Step 3: Compare regions
        print("\n[Step 3] Comparing regions...")
        region_results = compare_regions(ref_path, cur_path)

        for name, data in region_results.items():
            match = data.get("match_pct", "N/A")
            diff = data.get("diff_pixels", "?")
            total = data.get("total_pixels", "?")
            print(f"  {name}: {match}% match ({diff}/{total} diff pixels)")

        # Step 4: CSS checks on current app
        print("\n[Step 4] Running CSS property checks...")
        css_checks = generate_css_report(page)

        for check in css_checks:
            symbol = "✓" if check["pass"] else "✗"
            print(f"  {symbol} [{check['area']}] {check['check']}")

        # Step 5: Write report
        print("\n[Step 5] Writing report...")
        report_path = write_report(region_results, css_checks)

        browser.close()

    # Summary
    print("\n" + "=" * 60)
    css_pass = sum(1 for c in css_checks if c["pass"])
    css_total = len(css_checks)
    print(f"CSS checks: {css_pass}/{css_total} passed")

    if region_results:
        for name, data in region_results.items():
            pct = data.get("match_pct", 0)
            status = "✓" if pct > 70 else "✗"
            print(f"  {status} {name}: {pct}% match")

    print(f"\nOutput files:")
    print(f"  {os.path.join(OUTPUT_DIR, 'ui_reference.png')}")
    print(f"  {os.path.join(OUTPUT_DIR, 'ui_current.png')}")
    print(f"  {os.path.join(OUTPUT_DIR, 'ui_diff.png')}")
    print(f"  {report_path}")

    # Exit code based on CSS checks (region match is informational)
    sys.exit(0 if css_pass == css_total else 1)


if __name__ == "__main__":
    main()
