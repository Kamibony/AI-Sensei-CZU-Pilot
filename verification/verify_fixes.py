
import time
from playwright.sync_api import Page, expect, sync_playwright

def test_professor_library_and_wizard(page: Page):
    print("Step 1: Navigate to Login")
    page.goto("http://127.0.0.1:5000/")

    # Wait for role selection and click Professor
    print("Step 2: Select Professor Role")
    page.wait_for_selector("text=Jsem Profesor")
    page.click("text=Jsem Profesor")

    # Fill login form
    print("Step 3: Attempt Login")
    page.fill("#login-email", "profesor@profesor.cz")
    page.fill("#login-password", "password")
    page.click("button[type='submit']")

    # Check for login success or failure
    try:
        # Wait for either dashboard or error message
        page.wait_for_selector("#main-nav, .bg-red-50", timeout=5000)

        if page.is_visible(".bg-red-50"):
            print("Login failed (user might not exist). Attempting Registration...")
            page.click("text=Registrujte se")
            page.wait_for_selector("#register-name")
            page.fill("#register-name", "Test Profesor")
            page.fill("#register-email", "profesor@profesor.cz")
            page.fill("#register-password", "password")

            print("Submitting Registration via Enter key...")
            page.press("#register-password", "Enter")
            page.wait_for_selector("#main-nav", timeout=20000)

    except Exception as e:
        print(f"Exception during login/register flow: {e}")
        if page.is_visible("#main-nav"):
            print("Recovered: Dashboard is visible.")
        else:
            raise e

    # 4. Wait for dashboard and verify Library navigation
    print("Step 4: Wait for Dashboard")
    page.wait_for_selector("#main-nav", timeout=20000)

    # Navigate to Library
    print("Step 5: Navigate to Library")
    page.get_by_text("Knihovna lekcí").first.click()

    # Verify Library Header
    print("Step 6: Verify Library Loaded")
    expect(page.get_by_role("heading", name="Knihovna lekcí")).to_be_visible()

    # Verify "New Lesson" button exists and click it
    new_lesson_btn = page.get_by_text("Nová lekce")
    expect(new_lesson_btn).to_be_visible()

    # 5. Verify Wizard UI
    print("Step 7: Verify Wizard UI")
    new_lesson_btn.click()

    # Wait for Wizard header which is confirmed visible
    page.wait_for_selector("text=Nová lekce")

    # Verify structure and scrolling
    print("Step 8: Verify Scroll and Buttons")

    # Locate the scrollable container specifically within the wizard card (max-w-3xl)
    scrollable_container = page.locator(".max-w-3xl .overflow-y-auto")
    expect(scrollable_container).to_be_visible()

    # Scroll to bottom
    scrollable_container.evaluate("element => element.scrollTop = element.scrollHeight")

    # Check if the "Manuálně" button is visible
    manual_btn = page.get_by_role("button", name="Manuálně")
    expect(manual_btn).to_be_visible()

    # Check magic button
    magic_btn = page.get_by_role("button", name="Magicky vygenerovat")
    expect(magic_btn).to_be_visible()

    # Take screenshot of the Wizard UI with buttons visible
    page.screenshot(path="verification/wizard_ui_fixed.png")
    print("Wizard UI verified: Scroll works and buttons are reachable.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_professor_library_and_wizard(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/failure_6.png")
        finally:
            browser.close()
