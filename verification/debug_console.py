from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Attach event listeners to capture console logs and errors
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))
    page.on("requestfailed", lambda req: print(f"FAILED: {req.url} - {req.failure}"))

    try:
        print("Navigating...")
        page.goto("http://127.0.0.1:5000")
        page.wait_for_load_state("networkidle")
        print("Load complete")

        # Take a screenshot to see the state
        page.screenshot(path="verification/console_debug.png")

    except Exception as e:
        print(f"SCRIPT ERROR: {e}")
    finally:
        browser.close()

with sync_playwright() as p:
    run(p)
