
import asyncio
import time
from playwright.async_api import async_playwright, expect

async def verify_professor_ui_reg():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            print("Navigating...")
            await page.goto("http://127.0.0.1:5000/")
            # Increase timeout for initial load
            await page.wait_for_load_state("networkidle", timeout=10000)

            email = f"prof_{int(time.time())}@test.cz"
            print(f"Attempting to register as {email}...")

            # Fill registration form (assuming it's the second set of inputs or named specifically)
            # We try to match the structure seen in the screenshot

            # Find the registration header
            reg_header = page.get_by_text("Registrace pro studenty") # It says "pro studenty" but has the prof checkbox?
            if await reg_header.count() > 0:
                print("Found Registration section.")

            # Use specific selectors if possible, or fallbacks
            # Input 1: Email (Registration)
            # We assume the registration form is the second form
            # Inputs:
            # 1. Login Email
            # 2. Login Pass
            # 3. Reg Email
            # 4. Reg Pass

            inputs = await page.locator("input[type='text'], input[type='email']").all()
            passwords = await page.locator("input[type='password']").all()

            if len(inputs) >= 2:
                # 2nd text/email input is likely Reg Email
                await inputs[1].fill(email)
            else:
                # Fallback: try by placeholder
                await page.get_by_placeholder("Email").nth(1).fill(email)

            if len(passwords) >= 2:
                await passwords[1].fill("password123")
            else:
                await page.get_by_placeholder("Heslo").nth(1).fill("password123")

            # Check the professor checkbox
            # We look for the label
            await page.click("text=Registrovat se jako profesor")

            # Click Register
            await page.click("button:has-text('Zaregistrovat se')")

            print("Registration submitted. Waiting for Command Center...")

            # Wait for dashboard
            # This confirms we logged in AND the dashboard rendered (meaning my changes worked)
            await expect(page.get_by_text("Command Center")).to_be_visible(timeout=20000)
            print("Dashboard verified!")

            await page.screenshot(path="verification/dashboard.png")

            # Verify Sidebar
            print("Verifying Sidebar...")
            # Click 'Plán výuky' (Timeline)
            await page.click("button[data-view='timeline']")
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verification/timeline_view.png")
            print("Timeline screenshot taken.")

            # Verify Navigation back to Dashboard via Logo
            print("Clicking Logo...")
            await page.click("#nav-logo")
            await expect(page.get_by_text("Command Center")).to_be_visible()
            print("Back on Dashboard.")

            # Verify 'Moje Třídy' card
            print("Clicking 'Moje Třídy'...")
            await page.get_by_text("Moje Třídy").click()
            await page.wait_for_timeout(1000)
            # If successful, we are still on dashboard but scrolled.
            await page.screenshot(path="verification/dashboard_scrolled.png")
            print("Verified.")

        except Exception as e:
            print(f"Error: {e}")
            await page.screenshot(path="verification/error_reg.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_professor_ui_reg())
