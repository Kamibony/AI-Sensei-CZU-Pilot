import asyncio
from playwright.async_api import async_playwright, expect
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Listen for all console events and print them
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"BROWSER PAGE ERROR: {exc.name}: {exc.message}"))

        try:
            # --- Professor Flow ---
            print("--- Verifying Professor Flow (Empty State) ---")
            await page.goto("http://127.0.0.1:5000", wait_until="domcontentloaded")

            # Click professor login
            await page.get_by_role("button", name="Vstoupit jako Profesor").click(timeout=10000)

            # Wait for the main dashboard element that is always present
            await expect(page.get_by_role("button", name="+ Nová lekce")).to_be_visible(timeout=15000)
            print("Professor dashboard loaded successfully in empty state.")
            await page.screenshot(path="jules-scratch/verification/01_professor_dashboard_empty.png")

            # Logout
            await page.get_by_role("button", name="Odhlásit").click()
            await expect(page.get_by_role("heading", name="Vítejte v AI Sensei")).to_be_visible(timeout=10000)
            print("Logout successful.")

            # --- Student Flow ---
            print("\n--- Verifying Student Flow (Empty State) ---")

            # Go to registration form
            await page.get_by_role("link", name="Nemáte účet? Zaregistrujte se").click()

            # Register a new unique student
            unique_email = f"test.student.{int(time.time())}@example.com"
            await page.get_by_placeholder("Zadejte váš email").fill(unique_email)
            await page.get_by_placeholder("Zadejte nové heslo").fill("password123")
            await page.get_by_role("button", name="Zaregistrovat").click()
            print(f"Registered new student: {unique_email}")

            # Wait for student dashboard and verify the empty state message
            await expect(page.get_by_text("Pro vás zatím nebyly připraveny žádné lekce.")).to_be_visible(timeout=15000)
            print("Student dashboard loaded successfully and shows correct empty state message.")
            await page.screenshot(path="jules-scratch/verification/02_student_dashboard_empty.png")

        except Exception as e:
            print(f"\nAN ERROR OCCURRED: {e}")
            print("Taking a screenshot of the failure state.")
            await page.screenshot(path="jules-scratch/verification/failure_screenshot.png")

        finally:
            await browser.close()
            print("\nVerification script completed.")

if __name__ == "__main__":
    asyncio.run(main())