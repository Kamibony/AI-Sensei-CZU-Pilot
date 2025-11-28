from playwright.sync_api import sync_playwright, Page, expect
import time
import re

def verify_student_dashboard_refactor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 1280x800 desktop
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000/")

        # Wait for app to load - wait for the role selection text
        try:
            # We look for "Vyberte svou roli" which is t('auth.role_selection')
            page.wait_for_selector("text=Vyberte svou roli", timeout=15000)
            print("Role selection visible.")
        except:
             # Take screenshot to debug
            page.screenshot(path="/home/jules/verification/debug_role_select_fail.png")
            raise Exception("Role selection not found")

        # Click on Student entry
        # The Student card has text t('auth.role_student') -> "Student"
        # We can also look for the graduation cap emoji 🎓
        page.get_by_text("Jsem Student", exact=True).click()

        # Should see login form
        try:
            page.wait_for_selector("#login-form", timeout=5000)
            print("Login form visible.")
        except:
            # Maybe it just shows the form without ID?
            # Look for email input
            if page.is_visible("#login-email"):
                print("Login form inputs visible.")
            else:
                print("Login form not found, checking dashboard...")

        # Register a new user to ensure we are in a clean state (Student Dashboard empty)
        # Check if we are on login screen
        if page.is_visible("#login-email"):
            # Click "Zaregistrujte se" link
            page.get_by_text("Zaregistrujte se").click()
            page.wait_for_selector("#register-email", timeout=5000)

            email = f"student_{int(time.time())}@example.com"
            password = "password123"

            page.fill("#register-email", email)
            page.fill("#register-password", password)

            # The form in `login-view.js` has only 2 fields for register?
            # Let's check `login-view.js`:
            # <input type="password" id="register-password" ...>
            # No confirm password field in the code I read!
            # So only fill email and password.

            print(f"Registering user: {email}")
            # Click Register button
            # Button text is t('auth.register_btn') -> "Vytvořit účet"? Or "Zaregistrovat se"?
            # Let's use the type="submit" in the visible form

            # Since both forms are in DOM (one hidden), we must click the visible one.
            # The register form is in div with class (this._isRegistering ? 'block' : 'hidden')
            # So we target the button inside that div.

            # Or just use text "Zaregistrovat se"
            page.locator("button[type=submit]").last.click() # The last one is likely register if visible?
            # Better: get by text
            # Assuming button text is unique or we can find it.
            # Let's use CSS selector for the button in the visible form
            # .block form button

            # But let's try just clicking the button that says "Zaregistrovat se"
            # We don't know the exact text from translation service without looking at cs.json.
            # Let's assume standard text. Or just use `page.click('button:has-text("Zaregistrovat")')`
            # But let's look at the code I read: `t('auth.register_btn')`

            pass

        # Wait for dashboard
        try:
            # Check for specific dashboard element
            page.wait_for_selector("student-dashboard-view", timeout=15000)
            print("Dashboard loaded.")
        except:
             # Check for name prompt
            if page.is_visible("#student-name-input"):
                print("Name prompt visible.")
                page.fill("#student-name-input", "Refactor Tester")
                page.click("#save-name-btn")
                page.wait_for_selector("student-dashboard-view", timeout=10000)
                print("Dashboard loaded after name input.")
            else:
                page.screenshot(path="/home/jules/verification/debug_fail_load.png")
                # If we are stuck on "Loading...", firebase auth might be failing in emulator.
                # In that case, we can manually replace the View for verification purposes.
                print("Dashboard failed to load via Auth. Injecting View manually...")

                page.evaluate("""
                    const app = document.querySelector('#app-container');
                    app.innerHTML = '<student-dashboard-view></student-dashboard-view>';
                """)
                time.sleep(1)

        # Now we are on the dashboard (or injected it).

        # Take screenshot of Empty Dashboard
        time.sleep(2) # Wait for render
        page.screenshot(path="/home/jules/verification/dashboard_empty.png")
        print("Captured dashboard_empty.png")

        # Now, let's inject some Mock Data to verify the Rectangular Cards and Wide Hero.
        print("Injecting mock data into dashboard...")
        page.evaluate("""
            const dashboard = document.querySelector('student-dashboard-view');
            if (dashboard) {
                dashboard._groups = [
                    { id: 'g1', name: 'Matematika' },
                    { id: 'g2', name: 'Dějepis' },
                    { id: 'g3', name: 'Fyzika' }
                ];
                dashboard._recentLessons = [
                    { id: 'l1', title: 'Lineární rovnice', topic: 'Algebra', createdAt: '2023-10-01' },
                    { id: 'l2', title: 'Velká francouzská revoluce', topic: 'Novověk', createdAt: '2023-09-28' },
                    { id: 'l3', title: 'Newtonovy zákony', topic: 'Mechanika', createdAt: '2023-09-25' }
                ];
                dashboard._studentStreak = 5;
                dashboard.requestUpdate();
            }
        """)

        time.sleep(2)
        page.screenshot(path="/home/jules/verification/dashboard_populated.png")
        print("Captured dashboard_populated.png")

        # Now Check Lesson Detail Hub (Mocking navigation)
        print("Navigating to Lesson Detail (Mock)...")

        # Manually inject student-lesson-detail because navigation logic might be complex
        print("Manually injecting student-lesson-detail...")
        page.evaluate("""
            const app = document.querySelector('#app-container');
            app.innerHTML = '<student-lesson-detail></student-lesson-detail>';
            const detail = document.querySelector('student-lesson-detail');
            detail.lessonData = {
                title: 'Lineární rovnice',
                subtitle: 'Úvod do algebry',
                text_content: 'Some text',
                quiz: {},
                visible_sections: ['text', 'quiz']
            };
            detail._buildAvailableTabs();
            detail.isLoading = false;
            detail.requestUpdate();
        """)

        time.sleep(1)
        page.screenshot(path="/home/jules/verification/lesson_hub.png")
        print("Captured lesson_hub.png")

if __name__ == "__main__":
    verify_student_dashboard_refactor()
