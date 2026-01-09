
from playwright.sync_api import sync_playwright, expect

def test_editor_components():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        # Navigate to the test harness
        print("Navigating to test harness...")
        page.goto("http://localhost:8000/test_harness.html")

        # Wait for components to render
        print("Waiting for heading...")
        expect(page.get_by_role("heading", name="Presentation Editor View")).to_be_visible()

        # Take screenshot for debugging state
        page.screenshot(path="verification/debug_state.png", full_page=True)

        print("Checking for Introduction input...")
        # Check if we can find the input by value
        try:
            expect(page.locator("input[value='Introduction']")).to_be_visible(timeout=5000)
            print("Found Introduction input!")
        except Exception as e:
            print(f"Failed to find Introduction input: {e}")

        # Take final screenshot
        page.screenshot(path="verification/components_verified.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_editor_components()
