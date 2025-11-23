import asyncio
import random
import string
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            record_video_dir="verification/videos",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # Enable console logging
        def log_console(msg):
            print(f"CONSOLE: {msg.text}")
        page.on("console", log_console)

        print("Navigating to homepage...")
        # 1. Navigate to the app
        await page.goto("http://localhost:5000")

        # 2. Handle Auth - Role Selection
        print("Handling Auth...")
        # Wait for the role selection button and click it
        await page.wait_for_selector("#login-professor")
        await page.click("#login-professor")

        # 3. Register a new user to ensure clean state and access
        print("Registering new user...")

        # Click "Zaregistrujte se" link to switch to register form
        await page.click("#show-register-form")

        # Generate random credentials
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        email = f"prof_{random_suffix}@example.com"
        password = "Password123!"

        # Fill registration form
        await page.fill("#register-email", email)
        await page.fill("#register-password", password)

        # Check "Chci účet pro profesora"
        await page.check("#register-as-professor")

        # Click Register button
        await page.click("#register-btn")

        # 4. Wait for Dashboard
        print("Waiting for dashboard...")
        try:
            # Looking for the "Start New Lesson" text (matched to prompt)
            await page.wait_for_selector("text=Start New Lesson", timeout=30000)
            print("Dashboard loaded!")
        except Exception as e:
             print(f"Dashboard load failed: {e}")
             await page.screenshot(path="verification/dashboard_fail.png")
             await browser.close()
             return # Stop here if dashboard fails

        # 5. Capture Dashboard Screenshot
        await page.screenshot(path="verification/dashboard.png")
        print("Dashboard screenshot saved.")

        # 6. Verify "Studio" / "AI" Zone separation (Visual check via screenshot)

        # 7. Navigate to Editor (Zen Mode)
        print("Navigating to Editor...")
        # Find the "Start New Lesson" button/card and click it
        await page.click("text=Start New Lesson")

        # Wait for editor to load. 'lesson-editor' is the custom element.
        await page.wait_for_selector("lesson-editor")
        # Wait for the input inside the child component
        await page.wait_for_selector("input#lesson-title-input")

        # 8. Capture Editor Screenshot
        await page.screenshot(path="verification/editor_zen.png")
        print("Editor screenshot saved.")

        # 9. Test Editor Interaction (Step 2)
        print("Testing Editor Interaction...")
        # Fill title
        await page.fill("input#lesson-title-input", "Modern AI Lesson")

        # Click Next (assuming there is a next button or flow)
        await page.click("button:has-text('Pokračovat')")

        # Wait for Step 2 (Content Type Grid)
        await page.wait_for_selector("text=Co vytvoříme?")

        # 10. Capture Step 2 Screenshot
        await page.screenshot(path="verification/editor_step2.png")
        print("Editor Step 2 screenshot saved.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
