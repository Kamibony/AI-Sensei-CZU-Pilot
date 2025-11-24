from playwright.sync_api import sync_playwright, Page, expect
import time
import os

def verify_student_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Using a fixed context size to match desktop
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Navigating to app...")
        # Adjust URL if emulators run on different port, default hosting is 5000
        page.goto("http://localhost:5000/")

        # Wait for app to load
        page.wait_for_selector("#role-selection-card", timeout=10000)
        print("Role selection visible.")

        # Click on Student entry
        page.get_by_role("button", name="Vstoupit jako student").click()

        # Should see login form
        page.wait_for_selector("#login-form", timeout=5000)
        print("Login form visible.")

        # Fill login details for a test student
        # Assuming we can register or just log in if the emulator persistence is off.
        # Since it's a demo project, any email/password might work or we need to register.
        # Let's try to register a new user to be safe.

        page.get_by_text("Nemáte účet? Zaregistrujte se").click()
        page.wait_for_selector("#register-form", timeout=5000)

        email = f"student_{int(time.time())}@example.com"
        password = "password123"

        page.fill("#register-email", email)
        page.fill("#register-password", password)
        page.fill("#register-confirm-password", password)

        print(f"Registering user: {email}")
        page.get_by_role("button", name="Zaregistrovat se").click()

        # Wait for dashboard
        # It might ask for name first
        try:
            page.wait_for_selector("student-dashboard-view", timeout=15000)
            print("Dashboard loaded directly.")
        except:
            # Check for name prompt
            if page.is_visible("#student-name-input"):
                print("Name prompt visible.")
                page.fill("#student-name-input", "Test Student")
                page.click("#save-name-btn")
                page.wait_for_selector("student-dashboard-view", timeout=10000)
                print("Dashboard loaded after name input.")
            else:
                print("Dashboard not found, checking for errors...")
                page.screenshot(path="/home/jules/verification/debug_dashboard_fail.png")
                raise Exception("Dashboard failed to load")

        # 1. Verify Desktop Navigation
        print("Verifying Navigation...")
        page.screenshot(path="/home/jules/verification/1_dashboard.png")

        # Check sidebar classes/existence
        nav = page.locator("#main-nav")
        expect(nav).to_be_visible()
        # Verify specific updated class
        expect(nav).to_have_class(re.compile(r"bg-white/90"))

        # 2. Navigate to Library (Knihovna)
        print("Navigating to Library...")
        page.click("#nav-desktop-courses")

        page.wait_for_selector("student-lesson-list", timeout=5000)
        time.sleep(2) # Wait for animations
        page.screenshot(path="/home/jules/verification/2_library_empty.png")

        # We need a lesson to test the Hub.
        # Since we just registered, we have no group and no lessons.
        # We need to simulate joining a class or manually create data in Firestore.
        # In this environment, we can't easily seed data without admin access.

        # However, for visual verification of the *code structure*, we can inspect the DOM of the empty state
        # or try to inject a mock lesson into the component via JS if possible, or use a "Professor" account to create one.

        # Let's try to log out and log in as Professor to create a lesson?
        # That's complicated.

        # Alternative: We verify the Empty State in Lesson List looks correct (it should match our new HTML).
        # But we really want to see the Hub.

        # Let's try to mock the data on the client side for verification purposes.
        # We can execute script in the page to set the 'lessons' property of the 'student-lesson-list' component.

        print("Injecting mock lesson data...")
        page.evaluate("""
            const list = document.querySelector('student-lesson-list');
            if (list) {
                list.lessons = [{
                    id: 'mock-lesson-1',
                    title: 'Mock Lesson Title',
                    subtitle: 'This is a mock lesson subtitle for testing purposes.',
                    createdAt: new Date().toISOString()
                }];
                list.isNotInAnyGroup = false;
                list.requestUpdate();
            }
        """)

        time.sleep(1)
        page.screenshot(path="/home/jules/verification/3_library_with_mock.png")

        # 3. Click "Otevřít"
        print("Opening Lesson...")
        # Find the card and click
        page.locator("student-lesson-list").get_by_text("Otevřít").first.click()

        # Wait for detail view
        page.wait_for_selector("student-lesson-detail", timeout=5000)

        # Inject mock data into detail view because fetch will fail for mock ID
        print("Injecting mock detail data...")
        page.evaluate("""
            const detail = document.querySelector('student-lesson-detail');
            if (detail) {
                detail.lessonData = {
                    title: 'Mock Lesson Detail',
                    subtitle: 'Hub View Test',
                    text_content: '# Hello World',
                    youtube_link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    quiz: {},
                    test: {}
                };
                detail._buildAvailableTabs();
                detail.isLoading = false;
                detail.requestUpdate();
            }
        """)

        time.sleep(1)

        # 4. Verify Hub View
        print("Verifying Hub View...")
        page.screenshot(path="/home/jules/verification/4_hub_view.png")

        # Check for Hub Grid elements
        expect(page.get_by_text("Studijní Text")).to_be_visible()
        expect(page.get_by_text("Video")).to_be_visible()

        # 5. Enter Content Mode
        print("Entering Content Mode (Text)...")
        page.get_by_text("Studijní Text").click()

        time.sleep(1)
        page.screenshot(path="/home/jules/verification/5_content_mode.png")

        # Verify Sticky Header
        expect(page.get_by_text("Zpět na přehled lekce")).to_be_visible()

        print("Verification complete.")

if __name__ == "__main__":
    import re
    verify_student_frontend()
