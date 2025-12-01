import re
from playwright.sync_api import sync_playwright, expect

def test_fix(page):
    # Navigate to the app (using port 5000 based on previous success finding the page)
    page.goto("http://localhost:5000")

    # The screenshot shows "Jsem Profesor" and "Jsem Student" inside cards/buttons.
    # We verify that these texts are visible, confirming the app loaded and script execution didn't crash.

    expect(page.get_by_text("Jsem Profesor")).to_be_visible(timeout=15000)
    expect(page.get_by_text("Jsem Student")).to_be_visible(timeout=15000)

    # Take success screenshot
    page.screenshot(path="verification/verification_success.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_fix(page)
            print("Test passed!")
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/error_retry.png")
            raise
        finally:
            browser.close()
