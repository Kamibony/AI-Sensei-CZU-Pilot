from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    try:
        page.goto("http://127.0.0.1:5000")
        # Wait for the login-view to be present in DOM
        page.wait_for_selector("login-view", timeout=10000)

        # Take screenshot of login view
        page.screenshot(path="verification/login_view.png")

        # Now try to interact with Shadow DOM or Light DOM depending on implementation
        # login-view.js uses createRenderRoot() { return this; } ? No, it seems to use Shadow DOM by default as it is LitElement.
        # Let's check login-view.js content again. It doesn't have createRenderRoot override.
        # So it uses Shadow DOM.

        # Access shadow root
        # Or let Playwright handle it (it usually pierces shadow DOM automatically)

        # Try to find the button inside login-view
        # "Vstoupit jako student" might be inside the shadow root.

        # List all buttons text
        buttons = page.get_by_role("button").all()
        print(f"Buttons found: {[b.text_content() for b in buttons]}")

        student_btn = page.get_by_text("Student", exact=False).first
        if student_btn.is_visible():
            print("Student button visible")
            student_btn.click()

            # Now register
            register_link = page.get_by_text("Registrovat", exact=False).first
            if register_link.is_visible():
                register_link.click()

            page.screenshot(path="verification/register_view.png")
        else:
            print("Student button NOT visible")
            # Maybe we are already logged in?
            # Check for dashboard elements
            if page.locator("student-app").is_visible():
                print("Already logged in as student")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error_debug.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
