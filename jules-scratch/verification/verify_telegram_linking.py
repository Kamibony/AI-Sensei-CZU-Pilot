from playwright.sync_api import sync_playwright, expect
import time

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Navigate to the local server
        page.goto("http://localhost:8000")

        # --- Register a new student ---
        page.locator("#show-register-form").click()
        unique_email = f"student_{int(time.time())}@test.com"
        password = "password123"
        page.locator("#register-email").fill(unique_email)
        page.locator("#register-password").fill(password)
        page.locator("#register-btn").click()

        # --- Handle the race condition by logging out and back in ---
        # Wait for the initial dashboard to render (without the Telegram part)
        expect(page.locator("h1:has-text('Váš přehled')")).to_be_visible(timeout=15000)

        # Wait for a few seconds to allow the onStudentCreate cloud function to run
        print("Waiting for backend function to generate token...")
        page.wait_for_timeout(5000) # 5 second delay

        # Log out to clear the session
        print("Logging out...")
        page.locator("#logout-btn").click()

        # Wait for the login page to be visible again
        expect(page.locator("#login-btn")).to_be_visible(timeout=10000)
        print("Successfully logged out. Logging back in...")

        # Log back in with the same credentials
        page.locator("#login-email").fill(unique_email)
        page.locator("#login-password").fill(password)
        page.locator("#login-btn").click()

        # After re-login, the linking section should be visible
        expect(page.locator("text=Propojte svůj účet s Telegramem")).to_be_visible(timeout=10000)
        print("Telegram linking section is now visible.")

        # --- Verify the new UI elements ---
        heading = page.locator("h2:has-text('Propojte svůj účet s Telegramem')")
        expect(heading).to_be_visible()

        description = page.locator("p:has-text('Propojte svůj účet s Telegramem a získejte přístup ke komunikaci s profesorem')")
        expect(description).to_be_visible()

        link = page.locator("a:has-text('Propojit s Telegramem')")
        expect(link).to_be_visible()
        href = link.get_attribute("href")
        assert href.startswith("https://t.me/ai_sensei_czu_bot?start=")
        token = href.split("?start=")[1]
        assert len(token) > 10, "The connection token seems to be missing or too short."

        print("Successfully verified the new Telegram linking UI.")

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/telegram_linking_ui.png")
        print("Screenshot saved to jules-scratch/verification/telegram_linking_ui.png")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")
        print("Error screenshot saved to jules-scratch/verification/error_screenshot.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)