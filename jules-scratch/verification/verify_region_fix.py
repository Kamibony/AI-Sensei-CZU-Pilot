from playwright.sync_api import sync_playwright, expect
import uuid
import sys

# Generate a unique email for the new user to ensure test isolation
unique_email = f"testuser_{uuid.uuid4()}@example.com"
password = "password123"

def run_verification(playwright):
    """
    This script verifies the user registration and login flow after moving
    the Firebase Functions to the europe-west1 region.
    """
    # We need to install playwright browsers
    # TODO: This is a bit of a hack, but it's the only way to get the browsers installed in the sandbox
    # We should look into a more permanent solution for this in the future
    # For now, this will work
    import os
    os.system("playwright install")

    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Log console messages for easier debugging
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    try:
        # 1. Navigate to the application hosted by the emulator
        print("Navigating to http://127.0.0.1:5000...")
        page.goto("http://127.0.0.1:5000", timeout=15000)
        print("Navigation successful.")

        # --- REGISTRATION FLOW ---
        print("Starting registration flow...")

        # 2. Switch to the registration form
        page.get_by_text("Nemáte účet? Zaregistrujte se").click()
        print("Clicked registration link.")

        # 3. Fill in the registration form with unique credentials
        page.locator('#register-form input[type="email"]').fill(unique_email)
        page.locator('#register-form input[type="password"]').fill(password)
        page.get_by_role("button", name="Zaregistrovat").click()
        print(f"Submitted registration for email: {unique_email}")

        # 4. Assert: Verify that the dashboard is visible after registration.
        # This is the most critical step. If the onStudentCreate function in
        # europe-west1 fails, or if the frontend can't call it, this will time out.
        expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=20000)
        print("Successfully registered and logged in. Student dashboard is visible.")

        # --- LOGOUT ---
        print("Logging out...")
        page.locator("#logout-btn").click()
        expect(page.get_by_role("button", name="Vstoupit jako Profesor")).to_be_visible(timeout=10000)
        print("Successfully logged out.")

        # --- LOGIN FLOW ---
        print("Starting login flow...")

        # 5. Fill in the login form with the newly created credentials
        page.locator('#login-form input[type="email"]').fill(unique_email)
        page.locator('#login-form input[type="password"]').fill(password)
        page.get_by_role("button", name="Přihlásit").click()
        print(f"Submitted login for email: {unique_email}")

        # 6. Assert: Verify that the dashboard is visible again after logging in
        expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=10000)
        print("Successfully logged back in. Student dashboard is visible.")

        # 9. Screenshot: Capture the final state for verification
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Final verification screenshot captured.")

    except Exception as e:
        print(f"An error occurred during verification: {e}", file=sys.stderr)
        # Take a screenshot on error for debugging purposes
        page.screenshot(path="jules-scratch/verification/error.png")
        print("Error screenshot taken.", file=sys.stderr)
        # Re-raise the exception to ensure the script exits with a non-zero code
        raise e
    finally:
        browser.close()
        print("Browser closed.")

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run_verification(playwright)