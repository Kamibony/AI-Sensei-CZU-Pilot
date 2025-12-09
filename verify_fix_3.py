
import asyncio
from playwright.async_api import async_playwright, expect

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()

        print("Navigating to home page...")
        try:
            await page.goto("http://127.0.0.1:5000", timeout=30000)
        except Exception as e:
            print(f"Error navigating: {e}")
            await browser.close()
            return

        # Handle Role Selection if present
        try:
            role_btn = page.get_by_role("button", name="Vstoupit jako profesor")
            if await role_btn.is_visible(timeout=5000):
                print("Clicking Role Selection button...")
                await role_btn.click()
        except Exception:
            print("Role selection skipped or not found.")

        print("Logging in...")
        try:
            # Wait for email input to be visible
            await page.wait_for_selector("input[type=email]", timeout=5000)

            # Fill credentials
            await page.fill("input[type=email]", "profesor@profesor.cz")
            await page.fill("input[type=password]", "password123")

            # Click Login Button - using robust text match from screenshot
            await page.get_by_role("button", name="Přihlásit se").click()

            # Wait for dashboard
            print("Waiting for dashboard...")
            await page.wait_for_url("**/professor-dashboard**", timeout=15000)
            print("Logged in successfully.")

        except Exception as e:
            print(f"Login failed: {e}")
            await page.screenshot(path="/home/jules/verification/login_fail_3.png")
            await browser.close()
            return

        # 1. Verify Timeline Navigation (Sidebar should be hidden)
        print("Verifying Timeline Navigation...")
        try:
            # Navigate to Timeline (assuming there's a link or we can go directly)
            # Find the 'Knihovna Lekcí' link
            await page.get_by_text("Knihovna lekcí").click()

            # Wait for timeline view
            await page.wait_for_selector("timeline-view", timeout=5000)

            # Check if sidebar is hidden (professor-sidebar should NOT be visible)
            # Note: The fix put 'timeline' in fullWidthViews.
            # In fullWidthViews, the sidebar usually gets hidden or the main content expands.
            # Let's check if the main container has full width classes or sidebar is hidden.

            sidebar = page.locator("#professor-sidebar")
            # It might still be in DOM but hidden via CSS class 'hidden'
            is_hidden = await sidebar.get_attribute("class")
            if "hidden" in is_hidden:
                 print("SUCCESS: Sidebar is hidden on Timeline view.")
            else:
                 print(f"WARNING: Sidebar might be visible. Classes: {is_hidden}")

        except Exception as e:
            print(f"Timeline verification failed: {e}")
            await page.screenshot(path="/home/jules/verification/timeline_fail.png")

        # 2. Verify Lesson Editor UI Refactor
        print("Verifying Lesson Editor UI...")
        try:
            # Navigate to Lesson Editor (Create new lesson)
            # Usually a "Vytvořit lekci" button on the dashboard or sidebar
            # Let's go back to dashboard first
            await page.goto("http://127.0.0.1:5000/professor-dashboard")
            await page.get_by_text("Nová lekce").click()

            await page.wait_for_selector("lesson-editor", timeout=10000)

            # Check Hero Section (Gradient and Title)
            # The refactor added 'bg-gradient-to-r from-slate-50 to-slate-100' to a div
            # And 'text-4xl' to the title input

            title_input = page.locator("input.text-4xl")
            if await title_input.is_visible():
                print("SUCCESS: Large Title Input found.")
            else:
                print("FAIL: Large Title Input not found.")

            # Check Resource Grid Headers
            if await page.get_by_text("Kdo to uvidí?").is_visible():
                print("SUCCESS: 'Kdo to uvidí?' section found.")
            else:
                print("FAIL: 'Kdo to uvidí?' section not found.")

            if await page.get_by_text("Podklady").is_visible():
                print("SUCCESS: 'Podklady' section found.")
            else:
                print("FAIL: 'Podklady' section not found.")

            # Check Buttons
            if await page.get_by_role("button", name="Z Knihovny").is_visible():
                print("SUCCESS: 'Z Knihovny' button found.")
            else:
                 print("FAIL: 'Z Knihovny' button not found.")

            if await page.get_by_role("button", name="Nahrát nové").is_visible():
                print("SUCCESS: 'Nahrát nové' button found.")
            else:
                 print("FAIL: 'Nahrát nové' button not found.")

        except Exception as e:
            print(f"Lesson Editor UI verification failed: {e}")
            await page.screenshot(path="/home/jules/verification/editor_ui_fail.png")

        await page.screenshot(path="/home/jules/verification/final_success.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
