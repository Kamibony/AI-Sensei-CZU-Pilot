
from playwright.sync_api import sync_playwright, expect

def test_editor_components():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        print("Navigating...")
        page.goto("http://localhost:8000/test_harness.html")

        # Verify Presentation
        print("Verifying Presentation...")
        expect(page.get_by_role("heading", name="Presentation Editor View")).to_be_visible()
        # Look for the slide content
        expect(page.locator("input[value='Introduction']")).to_be_visible()
        expect(page.locator("textarea").first).to_contain_text("Welcome everyone")

        # Verify Quiz
        print("Verifying Quiz...")
        expect(page.get_by_role("heading", name="Quiz Editor View")).to_be_visible()
        expect(page.locator("input[value='What is 2 + 2?']")).to_be_visible()
        expect(page.locator("input[value='4']")).to_be_visible()

        # Verify Test
        print("Verifying Test...")
        expect(page.get_by_role("heading", name="Test Editor View")).to_be_visible()
        expect(page.locator("input[value='Solve for x: 2x + 4 = 10']")).to_be_visible()

        page.screenshot(path="verification/verification_success.png", full_page=True)
        print("Verification successful!")

        browser.close()

if __name__ == "__main__":
    test_editor_components()
