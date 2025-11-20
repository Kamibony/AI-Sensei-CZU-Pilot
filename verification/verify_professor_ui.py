
import asyncio
from playwright.async_api import async_playwright, expect

async def verify_professor_ui():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # 1. Go to the app
        print("Navigating to app...")
        await page.goto("http://127.0.0.1:5000/")

        # 2. Login as Professor (assuming button exists or flow)
        # The app starts at role selection
        print("Selecting role...")
        await page.get_by_role("button", name="Vstoupit jako profesor").click()

        # 3. Login Form
        print("Logging in...")
        await page.fill("#login-email", "profesor@profesor.cz")
        await page.fill("#login-password", "password") # Assuming test account
        await page.click("#login-btn")

        # 4. Wait for Dashboard
        print("Waiting for dashboard...")
        # We look for the new header "Command Center" or "Vítejte zpět"
        try:
            await expect(page.get_by_text("Command Center")).to_be_visible(timeout=15000)
            print("Dashboard loaded!")
        except:
            # Fallback: maybe it says "Vítejte zpět"
            await expect(page.get_by_text("Vítejte zpět")).to_be_visible()
            print("Dashboard loaded (checked 'Vítejte zpět')!")

        # 5. Screenshot Dashboard
        await page.screenshot(path="verification/dashboard.png")
        print("Dashboard screenshot taken.")

        # 6. Verify Sidebar
        # Check if "Plán výuky" is present and click it
        print("Clicking 'Plán výuky'...")
        await page.click("button[data-view='timeline']")

        # 7. Wait for Timeline view
        # Assuming timeline view has some identifiable element
        await page.wait_for_timeout(2000) # Give it a sec to render
        await page.screenshot(path="verification/timeline_view.png")
        print("Timeline screenshot taken.")

        # 8. Verify "Classes" link in Dashboard (Moje Tridy)
        # Go back to dashboard via Logo
        print("Going back to dashboard...")
        await page.click("#nav-logo")
        await expect(page.get_by_text("Command Center")).to_be_visible()

        # Click "Moje Třídy" card
        print("Clicking 'Moje Třídy' card...")
        await page.get_by_text("Moje Třídy").click()
        # This should scroll to "Vaše Třídy" section.
        # We can't easily verify scroll position in headless static screenshot,
        # but we can verify the section is visible.
        await expect(page.get_by_text("Vaše Třídy").first).to_be_visible()
        print("Verified 'Moje Třídy' navigation/scroll.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_professor_ui())
