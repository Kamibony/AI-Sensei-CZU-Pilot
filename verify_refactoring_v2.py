import re
import sys
import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to home page...")
        page.goto("http://127.0.0.1:5000")

        # 1. Handle Role Selection
        print("Waiting for role selection...")
        try:
            page.wait_for_selector("text=Vstupte jako profesor", timeout=5000)
            page.click("text=Vstupte jako profesor")
        except:
            print("Role selection skipped or not found (might be already on login).")

        # 2. Go to Registration
        print("Switching to Registration...")
        try:
            page.wait_for_selector("#show-register-form", state="visible")
            page.click("#show-register-form")
        except Exception as e:
            print(f"Could not find register link: {e}")
            page.screenshot(path="debug_no_reg.png")
            return

        # 3. Fill Registration Form
        timestamp = int(time.time())
        email = f"prof_{timestamp}@test.com"
        password = "password123"

        print(f"Registering new professor: {email}")

        page.fill("#register-email", email)
        page.fill("#register-password", password)
        # page.fill("#register-password-confirm", password) # Removed: does not exist
        # Let's check the code provided earlier... auth.js uses register-password
        # Does it have confirm? The code for handleRegister doesn't show it reading confirm.
        # But let's check input IDs if we can...
        # Actually handleRegister only reads register-email, register-password, register-as-professor.

        # Check "Jsem profesor"
        # The ID is register-as-professor
        page.check("#register-as-professor")

        # Submit
        print("Submitting registration...")
        # The form has id="register-form-element"
        # We can just press Enter or click the button.
        # Finding the button inside the register form might be safer.
        # It usually says "Zaregistrovat se"
        page.click("#register-form-element button[type='submit']")

        # 4. Wait for Dashboard
        print("Waiting for Dashboard...")
        try:
            # Look for "Dobré ráno" or specific dashboard elements
            page.wait_for_selector("professor-dashboard-view", timeout=20000)
            print("Dashboard loaded!")
        except Exception as e:
            print(f"Dashboard load failed: {e}")
            page.screenshot(path="verification_failure.png")
            # Dump console logs if possible? (Hard in sync python without setup)
            return

        # 5. Verify Dashboard Changes
        print("Verifying Dashboard Refactor...")

        # Check for new Stat Cards with hover effects
        # We are looking for the 'Knihovna Lekcí' card which should target 'timeline'
        # The text might be "Lekce" or "Knihovna Lekcí" depending on implementation.
        # The stats card usually has a number and a label.

        page.wait_for_timeout(2000) # Wait for animation/render
        page.screenshot(path="dashboard_refactored.png")

        content = page.content()
        if "cursor-pointer" in content and "hover:scale-105" in content:
            print("SUCCESS: Interactive stat cards found.")
        else:
            print("WARNING: Interactive stat classes not found in HTML.")

        # 6. Verify Lesson Hub
        print("Verifying Lesson Hub...")

        # Click "Vytvořit novou lekci" to go to Editor
        # Usually this is in the "Right Column" -> "Vytvořit lekci"
        # Text might be "Nová lekce"

        page.click("text=Vytvořit novou lekci")

        # This should open 'settings' mode (Step 1)
        page.wait_for_selector("lesson-editor", timeout=5000)
        page.wait_for_timeout(1000)
        page.screenshot(path="lesson_editor_settings.png")
        print("Lesson Editor (Settings Mode) loaded.")

        # Fill title to proceed
        page.fill("#lesson-title", f"Test Lesson {timestamp}")
        # Click "Pokračovat na obsah"
        page.click("text=Pokračovat na obsah")

        # Should now be in HUB mode
        page.wait_for_selector("text=Upravit detaily", timeout=5000)
        print("Lesson Hub loaded.")
        page.screenshot(path="lesson_editor_hub.png")

        browser.close()

if __name__ == "__main__":
    run()
