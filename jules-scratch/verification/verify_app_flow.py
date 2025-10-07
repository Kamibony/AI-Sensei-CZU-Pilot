import asyncio
from playwright.async_api import async_playwright, expect
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Listen for all console events and print them correctly
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        # Listen for uncaught exceptions correctly
        page.on("pageerror", lambda exc: print(f"BROWSER PAGE ERROR: {exc.name}: {exc.message}"))

        # --- Professor Flow ---
        print("--- Verifying Professor Flow ---")
        await page.goto("http://127.0.0.1:5000", wait_until="domcontentloaded")

        try:
            # Click professor login
            await page.get_by_role("button", name="Vstoupit jako Profesor").click(timeout=10000)

            # Wait for dashboard and take screenshot
            await expect(page.get_by_role("heading", name="Knihovna lekcí")).to_be_visible(timeout=15000)
            print("Professor dashboard loaded.")
            await page.screenshot(path="jules-scratch/verification/01_professor_dashboard.png")

            # Click the first lesson bubble to go to the editor
            await page.locator('.lesson-bubble-in-library [draggable="true"]').first.click()
            await expect(page.get_by_role("heading", name="Detaily lekce")).to_be_visible(timeout=10000)
            print("Professor editor loaded.")
            await page.screenshot(path="jules-scratch/verification/02_professor_editor.png")

            # Logout
            await page.get_by_role("button", name="Odhlásit").click()
            await expect(page.get_by_role("heading", name="Vítejte v AI Sensei")).to_be_visible(timeout=10000)
            print("Logout successful.")

            # --- Student Flow ---
            print("\n--- Verifying Student Flow ---")

            # Go to registration form
            await page.get_by_role("link", name="Nemáte účet? Zaregistrujte se").click()

            # Register a new unique student
            unique_email = f"test.student.{int(time.time())}@example.com"
            await page.get_by_placeholder("Zadejte váš email").fill(unique_email)
            await page.get_by_placeholder("Zadejte nové heslo").fill("password123")
            await page.get_by_role("button", name="Zaregistrovat").click()
            print(f"Registered new student: {unique_email}")

            # Wait for student dashboard and take screenshot
            await expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=15000)
            print("Student dashboard loaded.")
            await page.screenshot(path="jules-scratch/verification/03_student_dashboard.png")

            # Click the first lesson card
            await page.locator(".student-lesson-card").first.click()

            # Wait for the lesson detail view and take screenshot
            await expect(page.get_by_role("button", name="Zpět na přehled")).to_be_visible(timeout=10000)
            print("Student lesson view loaded.")
            await page.screenshot(path="jules-scratch/verification/04_student_lesson_view.png")

        except Exception as e:
            print(f"\nAN ERROR OCCURRED: {e}")
            print("Taking a screenshot of the failure state.")
            await page.screenshot(path="jules-scratch/verification/failure_screenshot.png")

        await browser.close()
        print("\nVerification script completed.")

if __name__ == "__main__":
    asyncio.run(main())