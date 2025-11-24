from playwright.sync_api import sync_playwright, expect
import time
import sys

def test_student_dashboard(page):
    # 1. Navigate to the app
    print("Navigating to app...")
    page.goto("http://localhost:5000/")

    # Wait for initial load
    time.sleep(5)

    # 2. Login as Student (Legacy Admin fallback often works for testing if allowed, but we need student view)
    # We will try to click "Vstoupit jako profesor" then switch to student login if available,
    # BUT the prompt says "Vstoupit jako profesor" goes to professor login.
    # The default view has a login form for students.

    print("Checking for login form...")
    # Check if we are on role selection or login
    # Based on index.html template, it starts empty then renders login-template.

    # Wait for login form
    try:
        page.wait_for_selector("#login-email", timeout=10000)
        print("Login form found.")
    except:
        print("Login form not found. Checking body...")
        print(page.content())
        return

    # Login with a test student account
    # Since we don't have a guaranteed account, we'll try to register one or use a known one.
    # Actually, emulators are fresh. We need to register.

    print("Switching to register form...")
    page.click("#show-register-form")

    email = f"student_test_{int(time.time())}@test.com"
    password = "password123"

    print(f"Registering {email}...")
    page.fill("#register-email", email)
    page.fill("#register-password", password)
    page.click("#register-btn")

    # Wait for dashboard to load
    # The dashboard header says "Dobré ráno" or similar.
    # And we have a name prompt first.

    print("Waiting for name prompt or dashboard...")
    time.sleep(5)

    # Check for Name Prompt
    if page.is_visible("#student-name-input"):
        print("Name prompt visible. Filling name...")
        page.fill("#student-name-input", "Test Student")
        page.click("#save-name-btn")
        time.sleep(2)

    # Now we should be on the dashboard
    print("Verifying Dashboard...")

    # Verify Greeting
    try:
        expect(page.locator("h1")).to_contain_text("Dobré ráno")
        print("Greeting verified.")
    except Exception as e:
        print(f"Greeting verification failed: {e}")
        print(page.content())

    # Verify Bottom Nav (Mobile) - We need to emulate mobile or check visibility
    # The script runs in headless, default viewport is 1280x720 (Desktop).
    # So we should see Side Nav (#main-nav)

    print("Verifying Desktop Sidebar...")
    if page.is_visible("#main-nav"):
        print("Sidebar is visible.")
    else:
        print("Sidebar NOT visible.")

    # Verify "Pokračovat" section
    if page.get_by_text("Pokračovat").is_visible():
         print("Jump Back In section visible.")
    else:
         print("Jump Back In section NOT visible (might be empty if no lessons).")

    # Take screenshot of Home
    page.screenshot(path="verification/dashboard_home.png")
    print("Screenshot dashboard_home.png taken.")

    # Switch to Courses
    print("Switching to Courses...")
    page.click("button[data-nav='courses']")
    time.sleep(2)

    # Verify Title "Knihovna Kurzů"
    expect(page.locator("h2")).to_contain_text("Knihovna Kurzů")
    print("Courses view verified.")
    page.screenshot(path="verification/dashboard_courses.png")

    # Switch to Chat
    print("Switching to Chat...")
    page.click("button[data-nav='chat']")
    time.sleep(1)
    page.screenshot(path="verification/dashboard_chat.png")

    # Switch to Profile
    print("Switching to Profile...")
    page.click("button[data-nav='profile']")
    time.sleep(1)
    page.screenshot(path="verification/dashboard_profile.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        # Launch with arguments to ignore HTTPS errors if needed
        browser = p.chromium.launch(args=['--disable-web-security'])
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        try:
            test_student_dashboard(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/error_state.png")
        finally:
            browser.close()
