import pytest
from playwright.sync_api import Page, expect
import time
import random

# Generate a unique email for each test run to ensure isolation
unique_email = f"student_{random.randint(1000, 9999)}@test.com"
password = "password123"

def test_logout_from_detail_view_and_verify_login_screen(page: Page):
    """
    This test verifies that after logging out from a view that hides the main
    app container (like the student lesson detail view), the user is correctly
    returned to a visible login screen.
    This version includes extensive logging and error handling.
    """
    print("\n--- Starting test: test_logout_from_detail_view_and_verify_login_screen ---")
    try:
        # 1. Arrange: Go to the app and register a new student
        print("Step 1: Navigating to the app and registering...")
        page.goto("http://127.0.0.1:5000")

        # Navigate to registration form
        page.get_by_role("link", name="Nemáte účet? Zaregistrujte se").click()
        expect(page.get_by_role("heading", name="Registrace Studenta")).to_be_visible()

        # Fill out and submit registration
        page.locator("#register-email").fill(unique_email)
        page.locator("#register-password").fill(password)
        page.get_by_role("button", name="Vytvořit účet").click()
        print("Registration submitted.")

        # 2. Act: Navigate to a detail view and then log out
        print("Step 2: Navigating to detail view and logging out...")
        # Wait for the student dashboard to appear
        expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=15000)
        print("Student dashboard is visible.")

        # Click the first lesson to go to the detail view
        page.locator(".student-lesson-card").first.click()
        print("Clicked first lesson card.")

        # Wait for the lesson view to be visible
        expect(page.locator("#student-lesson-view")).to_be_visible()
        print("Student lesson view is visible.")

        # Click the back button to return to the dashboard
        page.locator("#back-to-student-dashboard-btn").click()
        print("Clicked back to dashboard button.")

        # Wait for the dashboard to be visible again
        expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=10000)
        print("Student dashboard is visible again.")

        # Now, click the main logout button
        page.get_by_role("button", name="Odhlásit se").click()
        print("Clicked logout button.")

        # 3. Assert: Verify the login screen is visible
        print("Step 3: Asserting login screen is visible...")
        expect(page.get_by_role("button", name="Vstoupit jako profesor")).to_be_visible(timeout=10000)
        print("Login screen is visible. Test Passed!")

        # 4. Screenshot: Capture the final state for visual verification.
        print("Step 4: Taking success screenshot...")
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Success screenshot taken.")

    except Exception as e:
        print(f"\n\n!!!!!!!!!! TEST FAILED !!!!!!!!!!")
        print(f"ERROR: {e}")
        print("Taking error screenshot...")
        page.screenshot(path="jules-scratch/verification/error.png")
        print("Error screenshot saved to jules-scratch/verification/error.png")
        # Re-raise the exception to ensure the test is marked as failed
        raise

    finally:
        print("--- Test finished ---")