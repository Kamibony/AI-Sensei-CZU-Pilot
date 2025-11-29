from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    try:
        page.goto("http://127.0.0.1:5000")

        # Wait for page to load
        page.wait_for_load_state("networkidle")

        # Check if app-container is populated
        content = page.content()
        print(f"HTML Content length: {len(content)}")

        # Take screenshot of whatever is rendered
        page.screenshot(path="verification/initial_load.png")

        # Check for error messages
        if "error" in content.lower():
             print("Possible error detected on page")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

import time
with sync_playwright() as playwright:
    run(playwright)
