from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    try:
        page.goto("http://127.0.0.1:5000")
        page.wait_for_load_state('networkidle')

        print(f"Title: {page.title()}")
        page.screenshot(path="verification/landing_page.png")

        # Try to find any buttons
        buttons = page.get_by_role("button").all()
        print(f"Buttons found: {[b.text_content() for b in buttons]}")

        # Check for student button specifically
        student_btn = page.get_by_text("Student", exact=False).first
        if student_btn.is_visible():
            print("Student button visible")
            student_btn.click()
            time.sleep(2)
            page.screenshot(path="verification/login_page.png")
        else:
            print("Student button NOT visible")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

import time
with sync_playwright() as playwright:
    run(playwright)
