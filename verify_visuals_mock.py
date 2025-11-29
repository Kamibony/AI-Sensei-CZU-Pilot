from playwright.sync_api import sync_playwright, Page, expect
import time

def verify_ui_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 1280x800 desktop
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000/")

        # Wait a bit for modules to load
        time.sleep(3)

        print("--- Verifying Student Dashboard ---")
        # Inject Dashboard View
        page.evaluate("""
            const app = document.getElementById('app-container') || document.body;
            app.innerHTML = '<student-dashboard-view id="test-dashboard"></student-dashboard-view>';
            const dashboard = document.getElementById('test-dashboard');

            // Mock Data
            dashboard._studentName = "Test Student";
            dashboard._studentStreak = 5;
            dashboard._groups = [
                { id: 'g1', name: 'Matematika', ownerName: 'Prof. Novak' },
                { id: 'g2', name: 'Fyzika', ownerEmail: 'einstein@example.com' },
                { id: 'g3', name: 'Chemie' } // No owner info
            ];
            dashboard._recentLessons = [
                { id: 'l1', title: 'Lineární rovnice', topic: 'Algebra' },
                { id: 'l2', title: 'History Lesson', topic: 'History' }
            ];
            dashboard._isLoading = false;
            dashboard.requestUpdate();
        """)

        # Wait for render
        time.sleep(1)

        # 1. Check Jump Back In Card
        # Look for the gradient card
        jump_back_card = page.locator(".bg-gradient-to-br")
        if jump_back_card.count() > 0:
            print("✅ Jump Back In card found with gradient.")
            # Check content
            if "Lineární rovnice" in jump_back_card.inner_text():
                print("✅ Jump Back In card has correct title.")
            else:
                print("❌ Jump Back In card title mismatch.")
        else:
            print("❌ Jump Back In card NOT found.")

        # 2. Check Class Cards for Professor Name
        # We expect "Prof. Novak", "einstein@example.com", and fallback
        content = page.content()

        if "Prof. Novak" in content:
            print("✅ Professor Name displayed.")
        else:
            print("❌ Professor Name NOT displayed.")

        if "einstein@example.com" in content:
            print("✅ Professor Email displayed.")
        else:
            print("❌ Professor Email NOT displayed.")

        # Capture Screenshot
        page.screenshot(path="verify_dashboard_mock.png")
        print("📸 Dashboard screenshot saved to verify_dashboard_mock.png")


        print("\n--- Verifying Student Lesson Detail (Hub) ---")
        # Inject Lesson Detail View
        page.evaluate("""
            const app = document.getElementById('app-container') || document.body;
            app.innerHTML = '<student-lesson-detail id="test-detail"></student-lesson-detail>';
            const detail = document.getElementById('test-detail');

            // Mock Data
            detail.lessonData = {
                title: 'Test Lesson',
                subtitle: 'Testing Content Stats',
                text_content: 'Some text',
                presentation: [1, 2, 3, 4, 5], // 5 slides
                quiz: { questions: [1, 2, 3] }, // 3 questions
                visible_sections: ['presentation', 'quiz']
            };
            detail._buildAvailableTabs();
            detail.isLoading = false;
            detail._viewMode = 'hub';
            detail.requestUpdate();
        """)

        time.sleep(1)

        # 3. Check Content Stats
        # We expect "5 slidů" and "3 otázek"
        content_hub = page.content()

        if "5 slidů" in content_hub:
            print("✅ Presentation stats displayed (5 slidů).")
        else:
            print("❌ Presentation stats NOT displayed.")

        if "3 otázek" in content_hub:
            print("✅ Quiz stats displayed (3 otázek).")
        else:
             print("❌ Quiz stats NOT displayed.")

        # Capture Screenshot
        page.screenshot(path="verify_lesson_hub_mock.png")
        print("📸 Lesson Hub screenshot saved to verify_lesson_hub_mock.png")

        browser.close()

if __name__ == "__main__":
    verify_ui_changes()
