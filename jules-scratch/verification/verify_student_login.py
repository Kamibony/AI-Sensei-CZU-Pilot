import asyncio
from playwright.async_api import async_playwright, expect
import uuid

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # 1. Navigate to the app
            await page.goto("http://127.0.0.1:5000")

            # 2. Go to the registration form
            await page.get_by_role("link", name="Nemáte účet? Zaregistrujte se").click()

            # 3. Register a new student with a unique email
            unique_email = f"student_{uuid.uuid4()}@test.com"
            await page.locator("#register-email").fill(unique_email)
            await page.locator("#register-password").fill("password123")
            await page.get_by_role("button", name="Zaregistrovat se").click()

            # 4. Assert that the student dashboard is now visible
            # This is the key verification for the fix.
            student_dashboard_heading = page.get_by_role("heading", name="Váš přehled")
            await expect(student_dashboard_heading).to_be_visible(timeout=10000) # Wait up to 10s for the dashboard to load

            student_content_area = page.locator("#student-content-area")
            await expect(student_content_area).to_be_visible()

            print("Verification successful: Student dashboard is visible after login.")

            # 5. Take a screenshot for visual confirmation
            await page.screenshot(path="jules-scratch/verification/student_dashboard_visible.png")
            print("Screenshot saved to jules-scratch/verification/student_dashboard_visible.png")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            await page.screenshot(path="jules-scratch/verification/verification_error.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())