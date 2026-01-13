
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(permissions=[])
        page = await context.new_page()

        # Capture console logs to see JS errors
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGEERROR: {exc}"))

        # 1. Login
        print("Navigating to login page...")
        await page.goto("http://localhost:8000")

        # Wait for network idle to ensure components are loaded
        try:
            await page.wait_for_load_state("networkidle", timeout=5000)
        except:
            print("Network idle timeout, continuing...")

        # Wait a bit more for rendering
        await page.wait_for_timeout(2000)

        # Since createRenderRoot returns this, it's Light DOM.
        # However, the buttons might be dynamically rendered.

        # Attempt to click "Professor" button in role selection
        # Look for text "Professor" or "Vstoupit jako profesor" or use the SVG
        # The code for role selection:
        # <div @click=${() => this._selectRole('professor')} ...>
        # Let's try locating by text content of the card

        try:
            # Check if role selection is present
            if await page.locator("text=Vstoupit jako profesor").count() > 0:
                print("Clicking 'Vstoupit jako profesor'...")
                await page.click("text=Vstoupit jako profesor")
            else:
                # Maybe fallback to English?
                if await page.locator("text=Enter as Professor").count() > 0:
                     await page.click("text=Enter as Professor")
                else:
                    print("Could not find Professor role button. Maybe already in login form?")
        except Exception as e:
            print(f"Role click error: {e}")

        print("Logging in as antek@antek.sk...")

        # Now wait for the form input
        try:
            await page.wait_for_selector("#login-email", state="visible", timeout=5000)
            await page.fill("#login-email", "antek@antek.sk")
            await page.fill("#login-password", "123456")

            # Click submit button
            await page.click("button[type='submit']")
            print("Clicked login button.")
        except Exception as e:
             print(f"Login form interaction failed: {e}")
             await page.screenshot(path="login_form_fail.png")
             # dump content
             # print(await page.content())
             await browser.close()
             return


        # Wait for dashboard
        print("Waiting for dashboard...")
        try:
            # wait for specific dashboard element
            await page.wait_for_selector("professor-dashboard-view", timeout=15000)
            print("Login successful. Dashboard loaded.")
        except Exception as e:
            print("Dashboard did not load within timeout. Saving screenshot of failure.")
            await page.screenshot(path="login_fail_debug.png")
            raise e

        # 2. Inspect Dashboard
        await page.screenshot(path="anet_dashboard_debug.png")
        print("Screenshot saved: anet_dashboard_debug.png")

        # 3. Inspect "Lesson Library" for Lessons list
        print("Navigating to Lesson Library...")
        # Dispatch event to navigate
        await page.evaluate("document.querySelector('professor-app')._handleNavigate({detail: {view: 'library'}})")
        await page.wait_for_selector("professor-library-view", timeout=5000)

        # Wait for lessons to load
        await page.wait_for_timeout(2000)

        print("Listing Lessons:")
        lesson_titles = await page.eval_on_selector_all("professor-library-view h3", "els => els.map(e => e.innerText)")
        if not lesson_titles:
            print("(No lessons found)")
        for t in lesson_titles:
            print(f"- {t}")

        # 4. Inspect Classes
        print("Navigating to Classes...")
        await page.evaluate("document.querySelector('professor-app')._handleNavigate({detail: {view: 'classes'}})")
        await page.wait_for_selector("professor-classes-view", timeout=5000)

        # Wait for classes to load
        await page.wait_for_timeout(2000)

        print("Listing Classes:")
        class_names = await page.eval_on_selector_all("professor-classes-view h3", "els => els.map(e => e.innerText)")
        if not class_names:
            print("(No classes found)")
        for c in class_names:
            print(f"- {c}")

        # 5. Check "Občanské právo" assignment checkboxes
        print("Checking assignment for 'Občanské právo'...")
        # Navigate back to library
        await page.evaluate("document.querySelector('professor-app')._handleNavigate({detail: {view: 'library'}})")
        await page.wait_for_selector("professor-library-view")
        await page.wait_for_timeout(1000)

        # Find the lesson card
        try:
            # We look for h3 with text "Občanské právo"
            # And click the "Otevřít" button in that card.
            lesson_card = page.locator("div.group", has=page.locator("h3", has_text="Občanské právo"))

            if await lesson_card.count() > 0:
                print("Found lesson card.")
                # Force click using js if needed, or normal click
                await lesson_card.first.locator("button", has_text="Otevřít").click()
                print("Clicked Open button.")

                await page.wait_for_selector("lesson-editor", timeout=10000)
                print("Editor loaded.")

                # Look for checkboxes in _renderClassesPanel
                # We can look for inputs with type checkbox
                checkboxes = page.locator("lesson-editor input[type='checkbox']")
                count = await checkboxes.count()
                print(f"Found {count} assignment checkboxes.")

                any_checked = False
                for i in range(count):
                    is_checked = await checkboxes.nth(i).is_checked()
                    label = await checkboxes.nth(i).evaluate("el => el.closest('label').innerText")
                    print(f"  - Class '{label.strip()}': {'[x]' if is_checked else '[ ]'}")
                    if is_checked:
                        any_checked = True

                if not any_checked:
                    print("RESULT: No classes assigned (Checkbox is NOT checked).")
                else:
                    print("RESULT: Classes are assigned.")

            else:
                print("Lesson 'Občanské právo' NOT FOUND in Library.")
                # Save screenshot of library
                await page.screenshot(path="library_debug.png")

        except Exception as e:
            print(f"Error checking lesson: {e}")
            await page.screenshot(path="lesson_check_fail.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
