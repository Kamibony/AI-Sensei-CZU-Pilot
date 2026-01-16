from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        page.goto("http://localhost:8080/test_verification_fixes.html")

        # Wait for Lit components to render
        time.sleep(2)

        # 1. Lesson Detail
        print("Verifying Lesson Detail...")
        # Check that text content is present
        expect(page.get_by_text("This is study text.")).to_be_visible()
        # Check that file links are NOT present
        # The header was "Materiály ke stažení". I removed the whole block.
        if page.get_by_text("Materiály ke stažení").is_visible():
            print("FAILURE: 'Materiály ke stažení' is visible!")
        else:
            print("SUCCESS: 'Materiály ke stažení' is hidden.")
        expect(page.get_by_text("Materiály ke stažení")).not_to_be_visible()
        expect(page.get_by_text("Secret.pdf")).not_to_be_visible()

        # 2. Podcast Fallback
        print("Verifying Podcast Fallback...")
        # Use heading role to avoid matching harness text
        expect(page.get_by_role("heading", name="Přehrávání není k dispozici")).to_be_visible()
        expect(page.get_by_text("This is the transcript text that should be visible.")).to_be_visible()

        # 3. Chat Panel Localization
        print("Verifying Chat Panel Localization...")
        # Use heading role for robustness
        expect(page.get_by_role("heading", name="Komunikujte přes Telegram")).to_be_visible()
        expect(page.get_by_role("link", name="Otevřít Telegram Bota")).to_be_visible()

        # 4. Guide Bot Positioning
        print("Verifying Guide Bot Positioning...")
        bot_host = page.locator("guide-bot")
        # Check computed style
        position = bot_host.evaluate("element => getComputedStyle(element).position")
        bottom = bot_host.evaluate("element => getComputedStyle(element).bottom")
        right = bot_host.evaluate("element => getComputedStyle(element).right")

        print(f"Guide Bot Position: {position}, Bottom: {bottom}, Right: {right}")

        assert position == "fixed", f"Expected position fixed, got {position}"
        assert bottom == "20px", f"Expected bottom 20px, got {bottom}"
        assert right == "20px", f"Expected right 20px, got {right}"

        # Take screenshot
        page.screenshot(path="/home/jules/verification/fixes_verification.png", full_page=True)
        print("Screenshot saved.")
    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="/home/jules/verification/error.png")
        raise e
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
