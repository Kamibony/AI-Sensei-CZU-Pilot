from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the student login page
        page.goto("http://127.0.0.1:5000")

        # Wait for initial load
        page.wait_for_load_state('networkidle')

        # Click "Vstoupit jako student" if it exists (role selection)
        student_btn = page.get_by_text("Student", exact=False).first
        if student_btn.is_visible():
            student_btn.click()

        # Switch to registration
        register_link = page.get_by_text("Registrovat", exact=False).first
        if register_link.is_visible():
            register_link.click()

        # Fill registration
        email = f"teststudent_{int(time.time())}@example.com"
        password = "password123"

        page.fill('input[type="email"]', email)
        page.fill('input[type="password"]', password)

        # Submit
        submit_btn = page.get_by_role("button", name="Registrovat").first
        if not submit_btn.is_visible():
             submit_btn = page.get_by_role("button", name="Vytvořit účet").first

        submit_btn.click()

        # Wait for either dashboard or name prompt
        time.sleep(5)

        # Check if we are at name prompt
        name_input = page.locator('input#student-name-input')
        if name_input.is_visible():
             name_input.fill("Test Student")
             page.get_by_role("button").click()
             time.sleep(3)

        # Take screenshot
        page.screenshot(path="verification/student_dashboard.png")
        print("Screenshot taken")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
