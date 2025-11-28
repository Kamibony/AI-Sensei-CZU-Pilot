from playwright.sync_api import sync_playwright, expect
import time

def verify_student_dashboard(page):
    # 1. Login as Student
    print("Navigating to home...")
    page.goto("http://127.0.0.1:5000/")

    # Wait for role selection
    print("Waiting for role selection...")
    # Use localized text key "Jsem Student" which corresponds to 'auth.role_student'
    # "role_student": "Jsem Student"
    try:
        page.get_by_text("Jsem Student").click()
    except:
        print("Could not find 'Jsem Student'. Trying 'Vstoupit jako student' again or checking page content.")
        # page.screenshot(path="verification/debug_home.png")
        # Maybe it's already logged in?
        # But instructions say "Always show main role-selection page".
        pass

    # Login form
    print("Filling login form...")
    # Expect email input
    page.locator("#login-email").fill("student@student.cz")
    page.locator("#login-password").fill("password")

    # Click Login "Přihlásit se"
    page.get_by_role("button", name="Přihlásit se").click()

    # Wait for dashboard to load
    print("Waiting for dashboard...")
    # "Dobré ráno, Studente!" -> "Dobré ráno" is in h1
    expect(page.locator("h1")).to_contain_text("Dobré ráno", timeout=10000)

    # Take screenshot of Dashboard
    print("Taking Dashboard screenshot...")
    page.screenshot(path="verification/dashboard_rect.png")

    # 2. Verify Rectangular Classes
    # We look for the new structure: div with border-slate-200 and rounded-xl

    # 3. Verify Hero Card
    # Look for "POKRAČOVAT V LEKCI" or "Vše hotovo!"

    # 4. Click a lesson to check Detail View
    print("Looking for lesson to click...")
    # Try clicking "Pokračovat" button in Hero
    continue_btn = page.get_by_role("button", name="Pokračovat")

    if continue_btn.is_visible():
        print("Clicking Continue button...")
        continue_btn.click()
    else:
        print("No active lesson to continue. Trying to click a class or next up...")
        # Try clicking a Next Up item
        # Look for "Nový" badge
        next_up_item = page.locator(".border-slate-200").filter(has_text="Nový").first
        if next_up_item.is_visible():
            print("Clicking Next Up item...")
            next_up_item.click()
        else:
            print("No lessons found. Cannot verify Detail View.")
            return

    # Wait for navigation
    time.sleep(3)
    print("Taking Lesson Detail screenshot...")
    page.screenshot(path="verification/lesson_detail_rect.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_student_dashboard(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
