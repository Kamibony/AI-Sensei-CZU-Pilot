
from playwright.sync_api import sync_playwright, expect
import time

def verify_professor_library(page):
    # 1. Login as professor (or bypass)
    # Assuming default emulator port 5000 for hosting, 9099 for auth
    # We need to ensure we can access the professor view.
    # The app uses Firebase Auth. We might need to automate login.

    page.goto("http://localhost:5000")

    # Wait for app to load
    time.sleep(5)

    # Check if we are on login page or dashboard.
    # If on login page, perform login.
    # Assuming there's a button "Vstoupit jako profesor" based on memory
    try:
        page.get_by_role("button", name="Vstoupit jako profesor").click()
    except:
        print("Could not find role selection button, maybe already on login form")

    # Fill login form
    try:
        page.fill("#login-email", "profesor@profesor.cz")
        page.fill("#login-password", "password") # Assuming a default password or test account
        page.click("#login-btn")

        # Wait for navigation
        page.wait_for_url("**/#dashboard", timeout=10000)
    except Exception as e:
        print(f"Login flow error or already logged in: {e}")

    # 2. Navigate to Library
    # The menu item "Knihovna lekcí" should now point to #library
    # Click on sidebar menu item.
    time.sleep(3) # Wait for dashboard to settle

    # Find the library link. It has 'data-view="library"'
    page.click("button[data-view='library']")

    # Wait for library view
    expect(page.locator("professor-library-view")).to_be_visible(timeout=5000)

    # Take screenshot of Library
    page.screenshot(path="verification/1_library_view.png")

    # 3. Click "New Lesson" (Nová lekce)
    page.get_by_role("button", name="Nová lekce").click()

    # Wait for Editor (Wizard Mode)
    expect(page.locator("lesson-editor")).to_be_visible(timeout=5000)
    time.sleep(1)

    # Take screenshot of Wizard
    page.screenshot(path="verification/2_wizard_view.png")

    # 4. Verify Wizard Elements
    # Check for "Magicky vygenerovat" and "Manuálně" buttons
    expect(page.get_by_role("button", name="Magicky vygenerovat")).to_be_visible()
    expect(page.get_by_role("button", name="Manuálně")).to_be_visible()

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            verify_professor_library(page)
            print("Verification script finished successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
