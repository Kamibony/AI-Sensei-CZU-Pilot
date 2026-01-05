import re
from playwright.sync_api import sync_playwright, expect
import time
import datetime

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    email = f"test_prof_{timestamp}@test.com"
    password = "password123"
    name = f"Test Prof {timestamp}"

    try:
        # 1. Navigate & Login
        print("Navigating to root...")
        page.goto("http://localhost:5000/")
        page.locator("button", has_text="👨‍🏫").click()
        page.locator("a", has_text="Registrujte se").click()

        print(f"Registering: {email}")
        page.fill("#register-name", name)
        page.fill("#register-email", email)
        page.fill("#register-password", password)
        page.locator("form:visible button[type='submit']").click()

        print("Waiting for dashboard...")
        try:
            expect(page.locator("body")).to_contain_text("Učitelský panel", timeout=30000)
        except AssertionError:
             error_locator = page.locator(".bg-red-50.text-red-600").first
             if error_locator.is_visible():
                 raise Exception(f"Registration failed with UI error: {error_locator.inner_text()}")
             raise Exception("Timeout waiting for dashboard text.")

        # 2. Navigate to Editor
        print("Navigating to Lesson Editor (#editor)...")
        page.goto("http://localhost:5000/#editor")

        # 3. Verify Wizard
        print("Verifying Lesson Hub Wizard...")

        # Inputs
        expect(page.locator("#lesson-title")).to_be_visible()
        expect(page.locator("#lesson-topic")).to_be_visible()
        expect(page.locator("#class-selector")).to_be_visible()

        # Buttons
        expect(page.locator("button", has_text="Manuální tvorba")).to_be_visible()
        expect(page.locator("button", has_text="Magická tvorba")).to_be_visible()

        # Upload Button
        expect(page.locator("#upload-trigger-btn")).to_be_visible()

        print("SUCCESS: Lesson Hub Wizard is visible and fully verified.")
        page.screenshot(path="verification/success.png")

    except Exception as e:
        print(f"FAILED: {e}")
        page.screenshot(path="verification/failure_last.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
