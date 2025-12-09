import asyncio
from playwright.async_api import async_playwright
import time
import random
import string

def generate_random_email():
    """Generates a random email address to ensure a clean state."""
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"test_prof_{random_str}@example.com"

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Listen for console logs
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"BROWSER ERROR: {exc}"))

        print("Navigating to app...")
        try:
            await page.goto("http://localhost:8000/", timeout=60000)
        except Exception as e:
            print(f"Navigation failed: {e}")
            await browser.close()
            return

        print("Waiting for page load...")
        # Wait a bit for JS to init
        await page.wait_for_timeout(5000)

        # Check for role selection
        print("Checking for role selection buttons...")
        try:
            # "Jsem Profesor"
            professor_btn = page.get_by_text("Jsem Profesor")
            if await professor_btn.count() > 0:
                 print("Found 'Jsem Profesor' button. Clicking...")
                 await professor_btn.first.click()
            else:
                 print("'Jsem Profesor' button not found.")
        except Exception as e:
            print(f"Error checking role: {e}")

        # Wait for login view
        await page.wait_for_timeout(2000)

        # Always REGISTER for a fresh test to avoid "User not found" or previous state issues
        print("Switching to Registration...")
        reg_link = page.get_by_text("Registrujte se")
        if await reg_link.count() > 0:
             await reg_link.click()
             print("Switched to Registration form.")
             await page.wait_for_timeout(1000)

             test_email = generate_random_email()
             print(f"Registering with email: {test_email}")

             await page.locator("#register-email").fill(test_email)
             await page.locator("#register-password").fill("password123")

             if await page.locator("#register-name").count() > 0:
                  await page.locator("#register-name").fill("Test Professor")

             # "Chci učitelský účet" checkbox
             prof_check = page.get_by_text("Chci učitelský účet")
             if await prof_check.count() > 0:
                 await prof_check.click()
                 print("Checked Professor role checkbox.")

             # Click Register Button: "Registrovat se"
             await page.get_by_text("Registrovat se").click()
             print("Clicked Register.")

             # Wait for Dashboard - Increased timeout to 45s for role assignment
             print("Waiting for Dashboard (up to 45s)...")
             try:
                 # WAITING FOR professor-app INSTEAD OF app-root
                 await page.wait_for_selector("professor-app", timeout=45000)
                 print("Dashboard (professor-app) loaded successfully.")
                 await page.screenshot(path="dashboard_loaded.png")
             except Exception as e:
                 print(f"Dashboard load timeout: {e}")
                 await page.screenshot(path="error_dashboard_timeout.png")
                 # Check what IS visible
                 print("HTML Content dump:")
                 print(await page.content())
                 await browser.close()
                 return
        else:
             print("Registration link not found.")
             await browser.close()
             return


        # Verify Library Nav
        print("Checking for Library Navigation...")
        try:
            # "Knihovna lekcí"
            library_nav = page.get_by_text("Knihovna lekcí")
            if await library_nav.count() > 0:
                print("Library navigation found. Clicking...")
                await library_nav.first.click()
                await page.wait_for_timeout(2000)
                await page.screenshot(path="library_view.png")
                print("Library view screenshot taken.")
            else:
                print("Library navigation not found.")
                await page.screenshot(path="error_nav_not_found.png")
        except Exception as e:
            print(f"Library nav failed: {e}")
            await page.screenshot(path="error_nav_exception.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
