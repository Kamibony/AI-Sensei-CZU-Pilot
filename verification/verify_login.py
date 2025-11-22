
from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_login_redesign(page: Page):
    # 1. Navigate to the app
    page.goto("http://localhost:8080")

    # Wait for the login template to be rendered (it might take a moment if JS loads it)
    # In this app, app.js loads the login template into #app-container
    # We wait for the login button to be visible
    page.wait_for_selector("#login-btn", state="visible")

    # 2. Take a screenshot of the Login Page (Split Screen)
    # We want to capture the full viewport to see the split screen effect
    page.set_viewport_size({"width": 1280, "height": 800})

    # Check specific elements from the new design
    expect(page.locator("text=Budoucnost")).to_be_visible()
    expect(page.locator("text=Vzdělávání")).to_be_visible()
    expect(page.locator("#login-form")).to_be_visible()

    page.screenshot(path="verification/login_redesign.png")
    print("Login page screenshot taken.")

    # 3. Interact: Click "Register" link to see the transition (if implemented via JS/CSS)
    # The app uses JS to toggle hidden classes.
    page.click("#show-register-form")

    # Wait for register form to appear
    expect(page.locator("#register-form")).to_be_visible()

    # Take another screenshot
    page.screenshot(path="verification/register_redesign.png")
    print("Register page screenshot taken.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_login_redesign(page)
        except Exception as e:
            print(f"Error: {e}")
            # Take a screenshot on error
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
