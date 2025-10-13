import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Increase timeout because emulators can be slow
        page.set_default_timeout(60000)

        try:
            # Go to the app
            await page.goto("http://127.0.0.1:5000")

            # Click the student button
            await page.get_by_role("button", name="Jsem student").click()

            # Register a new user
            email = f"student_{asyncio.get_event_loop().time()}@test.com"
            password = "password123"
            await page.get_by_placeholder("E-mail").fill(email)
            await page.get_by_placeholder("Heslo").fill(password)
            await page.get_by_role("button", name="Registrovat").click()

            # Wait for the name prompt to appear
            await expect(page.get_by_text("Vítejte v AI Sensei!")).to_be_visible()

            # Fill in the student's name
            await page.get_by_placeholder("Vaše jméno a příjmení").fill("John Doe")
            await page.get_by_role("button", name="Uložit a pokračovat").click()

            # Wait for the main dashboard to load
            await expect(page.get_by_text("Váš přehled")).to_be_visible()

            # Check for the "no lessons" message, which is expected for a new user
            await expect(page.get_by_text("Profesor zatiaľ nenaplánoval žiadne lekcie.")).to_be_visible()

            print("Verification successful: Student dashboard loaded correctly after refactor.")

            # Take a screenshot
            await page.screenshot(path="jules-scratch/verification/student_dashboard.png")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

asyncio.run(main())