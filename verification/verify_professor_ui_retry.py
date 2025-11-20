
import asyncio
from playwright.async_api import async_playwright, expect

async def verify_professor_ui_retry():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            print("Navigating to app...")
            await page.goto("http://127.0.0.1:5000/")

            print("Selecting role...")
            # Wait for role selection to appear
            await page.wait_for_selector("button", timeout=10000)
            # Debug: Print all buttons
            buttons = await page.locator("button").all_inner_texts()
            print(f"Buttons found: {buttons}")

            await page.get_by_role("button", name="Vstoupit jako profesor").click()

            print("Logging in...")
            await page.wait_for_selector("#login-email")
            await page.fill("#login-email", "profesor@profesor.cz")
            await page.fill("#login-password", "password")
            await page.click("#login-btn")

            print("Waiting for dashboard load...")
            # Wait for network idle or some indication of load
            # await page.wait_for_load_state("networkidle")

            # Take a screenshot to see what's happening if it fails
            await page.wait_for_timeout(5000)
            await page.screenshot(path="verification/debug_state.png")

            # Check for dashboard
            # We look for h1 "Command Center" or "Vítejte zpět"
            content = await page.content()
            if "Command Center" in content:
                print("Found 'Command Center' in HTML source")
            elif "Vítejte zpět" in content:
                print("Found 'Vítejte zpět' in HTML source")
            else:
                print("Dashboard text not found in source.")

            # Try to verify
            await expect(page.get_by_text("Vítejte zpět,")).to_be_visible(timeout=10000)
            print("Dashboard verified!")

            await page.screenshot(path="verification/dashboard.png")

            # Sidebar verification
            print("Verifying Sidebar...")
            # Click 'Plán výuky' (Timeline)
            await page.click("button[data-view='timeline']")
            await page.wait_for_timeout(2000)
            await page.screenshot(path="verification/timeline_view.png")
            print("Timeline screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
            await page.screenshot(path="verification/error_state.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_professor_ui_retry())
