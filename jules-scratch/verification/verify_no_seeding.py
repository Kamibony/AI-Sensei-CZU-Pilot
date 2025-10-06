from playwright.sync_api import Page, expect
import sys

def test_no_data_seeding(page: Page):
    """
    This test verifies that the application no longer seeds the database
    with initial lesson data if the 'lessons' collection is empty.
    It now includes enhanced logging for debugging.
    """

    # Listen for all console events and print them to stdout
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.type}: {msg.text}"))
    # Listen for page errors, which are critical
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

    try:
        print("Navigating to http://127.0.0.1:5000...")
        page.goto("http://127.0.0.1:5000", timeout=15000)
        print("Navigation complete.")

        print("Looking for professor login button...")
        professor_login_button = page.get_by_role("button", name="Vstupte jako profesor")
        expect(professor_login_button).to_be_visible(timeout=10000)
        print("Professor login button found. Clicking...")
        professor_login_button.click()

        print("Waiting for professor dashboard to load...")
        main_content_area = page.locator("#main-content-area")
        expect(main_content_area).to_be_visible(timeout=15000)
        print("Professor dashboard loaded.")

        print("Checking for 'no lessons' message in all status columns...")
        scheduled_lessons = page.locator("#lessons-scheduled")
        active_lessons = page.locator("#lessons-active")
        archived_lessons = page.locator("#lessons-archived")

        expect(scheduled_lessons).to_contain_text("Žádné lekce v tomto stavu.", timeout=5000)
        print("Checked 'scheduled' column.")
        expect(active_lessons).to_contain_text("Žádné lekce v tomto stavu.", timeout=5000)
        print("Checked 'active' column.")
        expect(archived_lessons).to_contain_text("Žádné lekce v tomto stavu.", timeout=5000)
        print("Checked 'archived' column.")

        print("All assertions passed. Taking screenshot...")
        screenshot_path = "jules-scratch/verification/verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        print(f"An error occurred during Playwright script execution: {e}", file=sys.stderr)
        # Take a screenshot on failure to see the page state
        page.screenshot(path="jules-scratch/verification/error.png")
        print("Error screenshot saved to jules-scratch/verification/error.png", file=sys.stderr)
        # Re-raise the exception to ensure the script exits with a non-zero code
        raise

    finally:
        print("Verification script finished.")