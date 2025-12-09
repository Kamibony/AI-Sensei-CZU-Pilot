from playwright.sync_api import sync_playwright

def verify_button():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/verification/test_button.html")

        # Wait for component to render
        page.wait_for_selector("ai-generator-panel")

        # Take screenshot of the whole page
        page.screenshot(path="/home/jules/verification.png")
        browser.close()

if __name__ == "__main__":
    verify_button()
