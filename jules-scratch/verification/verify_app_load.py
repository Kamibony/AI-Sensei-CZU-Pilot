from playwright.sync_api import sync_playwright, expect

def run_verification(page):
    """
    Navigates to the app and verifies that the main container loads.
    """
    try:
        # Navigate to the local server
        page.goto("http://localhost:8000", wait_until="networkidle")

        # Wait for the login form to be visible
        # This confirms that the initial JavaScript has loaded and rendered the UI
        login_form = page.locator("#login-form")
        expect(login_form).to_be_visible(timeout=10000)

        print("Verification successful: Login form is visible.")

        # Take a screenshot for visual confirmation
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Screenshot saved to jules-scratch/verification/verification.png")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        import os
        # In case of error, save the page source and take a screenshot for debugging
        file_path = "jules-scratch/verification/page_source.html"
        abs_path = os.path.abspath(file_path)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(page.content())
        print(f"Page source saved to absolute path: {abs_path}")
        page.screenshot(path="jules-scratch/verification/error.png")
        raise

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        run_verification(page)
        browser.close()

if __name__ == "__main__":
    main()