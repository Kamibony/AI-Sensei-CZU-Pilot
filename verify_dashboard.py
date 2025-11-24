
import logging
from playwright.sync_api import sync_playwright

def run():
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            logging.info("Navigating to home page...")
            page.goto("http://127.0.0.1:5000")

            # 1. Login
            logging.info("Checking login state...")
            try:
                role_btn = page.locator("button:has-text('Vstoupit jako profesor')")
                if role_btn.is_visible(timeout=2000):
                    role_btn.click()
            except:
                pass

            logging.info("Filling Login credentials...")
            page.wait_for_selector("#login-email", state="visible")
            page.fill("#login-email", "prof_seeded@test.com")
            page.fill("#login-password", "password123")
            page.click("#login-btn")

            logging.info("Submitted login. Waiting for Dashboard...")

            # 2. Verify Dashboard
            page.wait_for_selector("professor-dashboard-view", state="visible", timeout=10000)

            # Allow animations/renders to settle
            page.wait_for_timeout(2000)

            page.screenshot(path="dashboard_refactored.png")
            logging.info("📸 Screenshot saved: dashboard_refactored.png")

            logging.info("Verifying Dashboard cards...")
            # Check for 'timeline' target (Knihovna Lekcí)
            if page.locator("text=Knihovna Lekcí").count() > 0:
                 logging.info("✅ 'Knihovna Lekcí' text found.")
            else:
                 logging.warning("⚠️ 'Knihovna Lekcí' text not found.")

            # 3. Navigate to Lesson Workflow
            logging.info("Clicking 'Nová Lekce'...")
            page.locator("text=Nová Lekce").click()

            logging.info("Waiting for Lesson Editor...")
            page.wait_for_selector("lesson-editor", state="visible", timeout=5000)

            # Should be in 'settings' mode (Step 1)
            logging.info("Verifying Settings Mode (Step 1)...")
            page.wait_for_selector("#lesson-title-input", state="visible")
            page.fill("#lesson-title-input", "Test Lesson Hub")

            page.screenshot(path="lesson_editor_settings.png")
            logging.info("📸 Screenshot saved: lesson_editor_settings.png")

            # Click "Pokračovat na obsah"
            logging.info("Clicking Continue...")
            page.locator("text=Pokračovat na obsah").click()

            # 4. Verify HUB Mode
            logging.info("Waiting for HUB Mode...")
            page.wait_for_selector("text=Upravit detaily", timeout=5000)
            logging.info("✅ Hub Header found.")

            # Check for content type cards
            text_card = page.locator("h3:has-text('Text')")
            if text_card.is_visible():
                logging.info("✅ 'Text' content card found.")

            page.screenshot(path="lesson_editor_hub.png")
            logging.info("📸 Screenshot saved: lesson_editor_hub.png")

            # 5. Verify Editor Navigation (Hub -> Editor)
            logging.info("Clicking 'Text' card to open editor...")
            # The card has an click listener on the wrapper div, but targeting the h3 works usually or the surrounding div
            page.locator("div.group", has_text="Text").first.click()

            logging.info("Waiting for Editor Mode...")
            page.wait_for_selector("#active-editor-content", state="visible", timeout=3000)

            # Verify "Back" button exists
            back_btn = page.locator("button:has-text('Zpět na přehled')")
            if back_btn.is_visible():
                logging.info("✅ Editor loaded and Back button visible.")
            else:
                 raise Exception("Back button not found in Editor mode.")

            page.screenshot(path="lesson_editor_active.png")

            # 6. Verify Back Navigation (Editor -> Hub)
            logging.info("Clicking 'Zpět na přehled'...")
            back_btn.click()

            logging.info("Waiting for Hub Mode again...")
            page.wait_for_selector("text=Upravit detaily", state="visible", timeout=3000)
            logging.info("✅ Successfully returned to Hub.")

            page.screenshot(path="lesson_editor_back_in_hub.png")

            logging.info("VERIFICATION SUCCESSFUL")

        except Exception as e:
            logging.error(f"Verification failed: {e}")
            page.screenshot(path="verification_error.png")
            raise

run()
