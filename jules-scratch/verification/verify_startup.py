from playwright.sync_api import sync_playwright

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page_errors = []
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        try:
            page.goto("http://127.0.0.1:5000", timeout=20000)

            # The app should show the login form. Let's wait for the professor login button.
            # This implicitly confirms that the JS loaded and executed.
            professor_button = page.get_by_role("button", name="Vstoupit jako profesor")
            professor_button.wait_for(state="visible", timeout=15000)

            if page_errors:
                raise Exception(f"Page errors detected: {'; '.join(page_errors)}")

            print("Verification successful: Login page loaded without errors.")
            page.screenshot(path="jules-scratch/verification/verification.png")
            print("Screenshot captured.")

        except Exception as e:
            print(f"Verification FAILED: {e}")
            # Save screenshot for debugging
            page.screenshot(path="jules-scratch/verification/failure_screenshot.png")

        finally:
            browser.close()

run_verification()