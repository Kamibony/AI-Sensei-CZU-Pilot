from playwright.sync_api import sync_playwright
import time

def handle_console(msg):
    print(f"BROWSER CONSOLE: {msg.text}")

def handle_error(err):
    print(f"BROWSER PAGE ERROR: {err}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", handle_console)
    page.on("pageerror", handle_error)

    print("Navigating to page...")
    page.goto("http://127.0.0.1:5000")

    print("Waiting for 5 seconds to capture logs...")
    time.sleep(5)

    print("Final page content:")
    print(page.content())

    print("Taking screenshot...")
    page.screenshot(path="jules-scratch/verification/verification.png")
    print("Screenshot taken.")

    browser.close()