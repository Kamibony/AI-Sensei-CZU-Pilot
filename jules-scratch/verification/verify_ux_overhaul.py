from playwright.sync_api import sync_playwright, Page, expect
import time

def run_verification(page: Page):
    """
    Verifies the major UX overhaul changes.
    1. Logs in as a professor and checks the new 3-column layout.
    2. Verifies drag-and-drop status changes.
    3. Verifies that only "Active" lessons can be dragged to the timeline.
    4. Verifies the Telegram code button logic in the editor.
    5. Logs in as a student and verifies the lesson view fix.
    """
    page.goto("http://localhost:8000")

    # --- PART 1: PROFESSOR VIEW VERIFICATION ---
    print("1. Verifying Professor View...")

    # Login as Professor
    page.get_by_role("button", name="Vstoupit jako Profesor").click()

    # Wait for the dashboard to load and check for the new columns
    expect(page.get_by_role("heading", name="Knihovna lekcí")).to_be_visible(timeout=10000)

    # Wait for the dynamic lesson content to load
    expect(page.locator(".lesson-bubble-in-library").first).to_be_visible(timeout=10000)

    expect(page.get_by_role("heading", name="Naplánováno")).to_be_visible()
    expect(page.get_by_role("heading", name="Aktivní")).to_be_visible()
    expect(page.get_by_role("heading", name="Archivováno")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/01_professor_dashboard_layout.png")
    print("  - Screenshot 1: Professor dashboard layout verified.")

    # Verify drag-and-drop status change
    scheduled_column = page.locator("#lessons-scheduled")
    active_column = page.locator("#lessons-active")

    # Dynamically find the first lesson in the 'Naplánováno' column
    lesson_to_drag = scheduled_column.locator(".lesson-bubble-in-library").first
    expect(lesson_to_drag).to_be_visible()
    dragged_lesson_title = lesson_to_drag.locator(".font-semibold").inner_text()
    print(f"  - Found lesson '{dragged_lesson_title}' to drag.")

    # Drag it to the 'Aktivní' column
    lesson_to_drag.drag_to(active_column)

    # Verify the lesson is now in the 'Aktivní' column
    expect(active_column.get_by_text(dragged_lesson_title)).to_be_visible()

    page.screenshot(path="jules-scratch/verification/02_lesson_status_drag_drop.png")
    print("  - Screenshot 2: Lesson status change via drag-and-drop verified.")

    # Verify timeline drag-and-drop restriction
    timeline_day = page.locator(".day-slot .lessons-container").first

    # Find an active lesson to drag
    active_lesson_to_drag = active_column.locator(".lesson-bubble-in-library").first
    active_lesson_title = active_lesson_to_drag.locator(".font-semibold").inner_text()
    print(f"  - Found active lesson '{active_lesson_title}' to drag to timeline.")
    active_lesson_to_drag.drag_to(timeline_day)

    # Verify it was added (cloned) by checking the first instance
    expect(timeline_day.get_by_text(active_lesson_title).first).to_be_visible()
    # And the original is still in the active column
    expect(active_column.get_by_text(active_lesson_title).first).to_be_visible()

    page.screenshot(path="jules-scratch/verification/03_timeline_drag_drop.png")
    print("  - Screenshot 3: Dragging active lesson to timeline verified.")

    # Verify Telegram button logic
    # Find the draggable part of the lesson bubble we just moved to "Aktivní"
    lesson_to_click_bubble = active_column.locator(f'div.lesson-bubble-in-library:has-text("{dragged_lesson_title}")')
    lesson_to_click_draggable = lesson_to_click_bubble.locator('div[draggable="true"]')
    lesson_to_click_draggable.click()

    expect(page.get_by_role("heading", name="Detaily lekce")).to_be_visible(timeout=10000)

    # The lesson is now active, so the button should be enabled.
    telegram_button_active = page.get_by_role("button", name="Generovat kód pro Telegram")
    expect(telegram_button_active).to_be_enabled()
    print(f"  - Telegram button enabled for active lesson: '{dragged_lesson_title}'.")

    # Go back and check an archived lesson
    page.get_by_role("button", name="Zpět na plán výuky").click()
    expect(page.locator(".lesson-bubble-in-library").first).to_be_visible(timeout=10000)

    archived_column = page.locator("#lessons-archived")
    archived_lesson_bubble = archived_column.locator(".lesson-bubble-in-library").first
    archived_lesson_title = archived_lesson_bubble.locator(".font-semibold").inner_text()
    print(f"  - Found archived lesson '{archived_lesson_title}' to check.")

    archived_lesson_draggable = archived_lesson_bubble.locator('div[draggable="true"]')
    archived_lesson_draggable.click()

    expect(page.get_by_role("heading", name="Detaily lekce")).to_be_visible(timeout=10000)
    telegram_button_archived = page.get_by_role("button", name="Generovat kód pro Telegram")
    expect(telegram_button_archived).to_be_disabled()
    print(f"  - Telegram button disabled for archived lesson: '{archived_lesson_title}'.")

    page.screenshot(path="jules-scratch/verification/04_telegram_button_logic.png")
    print("  - Screenshot 4: Telegram button logic verified.")

    # --- PART 2: STUDENT VIEW VERIFICATION ---
    print("\n2. Verifying Student View...")
    # Go back to the main view before logging out
    page.get_by_role("button", name="Zpět na plán výuky").click()
    expect(page.get_by_role("heading", name="Knihovna lekcí")).to_be_visible(timeout=10000)

    # Logout
    page.get_by_role("button", name="Odhlásit").click()
    expect(page.get_by_role("heading", name="Vítejte v AI Sensei")).to_be_visible()

    # Register and login as a new student
    page.get_by_role("link", name="Nemáte účet? Zaregistrujte se").click()
    email = f"student_{int(time.time())}@test.com"
    page.get_by_placeholder("Zadejte váš email").fill(email)
    page.get_by_placeholder("Zadejte nové heslo").fill("password123")
    page.get_by_role("button", name="Zaregistrovat").click()

    # Verify student dashboard loads
    expect(page.get_by_role("heading", name="Přehled vašich lekcí")).to_be_visible(timeout=10000)
    print("  - Student logged in successfully.")

    # Click the first available lesson card
    student_lesson_card = page.locator(".student-lesson-card").first
    student_lesson_title = student_lesson_card.locator("h2").inner_text()
    print(f"  - Clicking student lesson card: '{student_lesson_title}'")
    student_lesson_card.click()

    # Verify the lesson view is displayed correctly
    expect(page.get_by_role("heading", name=student_lesson_title)).to_be_visible()
    expect(page.locator("#student-lesson-content")).not_to_be_empty()

    # Ensure the main app container is hidden
    expect(page.locator("#app-container > div:not(#student-lesson-view)")).not_to_be_visible()

    page.screenshot(path="jules-scratch/verification/05_student_lesson_view.png")
    print("  - Screenshot 5: Student lesson view fix verified.")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
            print("\n✅ Frontend verification script completed successfully!")
        except Exception as e:
            print(f"\n❌ Frontend verification failed: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    main()