from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the test harness
        url = "http://localhost:8080/public/test_verification_ai.html"
        print(f"Navigating to {url}")
        page.goto(url)

        # Check if loaded
        try:
            expect(page.get_by_text("Verification Harness")).to_be_visible()
            print("Harness loaded.")
        except Exception as e:
            print("Failed to load harness.")
            page.screenshot(path="verification_scripts/error_load.png")
            raise e

        # Wait for component to render
        time.sleep(1)

        # Find Generate button
        print("Looking for Generate button...")
        try:
            # We look for the button with the text.
            btn = page.locator("button", has_text="editor.ai.generate_btn")
            btn.wait_for(state="visible", timeout=5000)
            btn.click()
            print("Clicked Generate.")
        except Exception as e:
            print("Button not found or not clickable.")
            page.screenshot(path="verification_scripts/error_button.png")
            print(page.content())
            raise e

        # Wait for "Mocked AI Slide" to appear
        print("Waiting for AI content...")
        try:
            # Wait for content
            page.wait_for_selector("text=Mocked AI Slide", timeout=5000)
            print("AI Content verified.")
        except Exception as e:
            print("AI Content not found.")
            page.screenshot(path="verification_scripts/error_content.png")
            raise e

        # Take screenshot
        page.screenshot(path="verification_scripts/verification_ai_editor.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
