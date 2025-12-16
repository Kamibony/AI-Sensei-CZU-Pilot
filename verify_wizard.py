import sys
import time
import re
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        # Use a persistent context to simulate a real user session if needed,
        # but for fresh registration, a new browser instance is fine.
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        page = browser.new_page()

        # Capture console logs to debug client-side errors
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGEERROR: {exc}"))

        try:
            print("Navigating to home...")
            # Using localhost:5000 (hosting emulator)
            page.goto("http://localhost:5000")

            # 1. Role Selection
            print("Selecting Professor role...")
            # Look for the card with the professor icon or text
            page.wait_for_selector("text=Profesor", timeout=5000)
            page.click("text=Profesor")

            # 2. Registration
            print("Switching to Registration...")
            # Click the "Registrujte se" link
            page.click("text=Registrujte se")

            # Generate unique user
            timestamp = int(time.time())
            email = f"prof_wiz_{timestamp}@test.com"
            password = "password123"
            name = f"Prof Wizard {timestamp}"

            print(f"Registering user: {email}...")
            page.fill("#register-name", name)
            page.fill("#register-email", email)
            page.fill("#register-password", password)

            # Submit
            # There might be two submit buttons (login vs register) hidden/shown.
            # The Register form is visible now.
            page.click("form:visible button[type='submit']")

            # 3. Wait for Dashboard
            print("Waiting for Dashboard...")
            # This relies on successful redirection after auth
            # "Tvůrčí studio" is a section header on the dashboard
            page.wait_for_selector("text=Tvůrčí studio", timeout=20000)
            print("Dashboard loaded.")

            # 4. Start Lesson Wizard
            print("Clicking 'Magický Generátor'...")
            page.click("text=Magický Generátor")

            # 5. Verify Wizard UI Changes
            print("Verifying Wizard UI...")
            # Check for Title input - The ID #lesson-title doesn't exist, using placeholder/class
            page.wait_for_selector("input[placeholder*='Např.']", state="visible")

            # Check for new Context Area (File Upload)
            # The translation key might be missing, so check for the fallback or the raw key seen in screenshot
            # "professor.editor.context_files" or "Zatím žádné soubory"
            page.wait_for_selector("text=Zatím žádné soubory", timeout=5000)
            print("Found Context Area (File Upload UI).")

            # Fill the title (required for auto-save logic check later)
            page.fill("input[placeholder*='Např.']", "Dejepis - Rím")

            # 6. Verify Magic Button Disabled initially
            print("Verifying Magic button is disabled...")
            magic_btn = page.locator("button:has-text('Magicky vygenerovat')")
            if not magic_btn.is_disabled():
                print("FAILURE: Magic button should be disabled when no files are uploaded.")
                # Depending on implementation, it might be visually disabled via class or 'disabled' attribute
                # My plan said: "add disabled attribute"
                sys.exit(1)
            print("Magic button is correctly disabled.")

            # 7. Test Auto-Save and Upload
            print("Uploading file to trigger Auto-Save...")

            # Create a dummy file
            with open("test_doc.txt", "w") as f:
                f.write("This is a test document for RAG.")

            # Upload
            # The input might be hidden or styled. Use set_input_files on the input element.
            # I need to find the input[type=file]
            file_input = page.locator("input[type='file']")
            file_input.set_input_files("test_doc.txt")

            print("File set. Waiting for upload/processing...")

            # Wait for Magic button to become ENABLED
            # This confirms:
            # 1. Auto-save happened (otherwise upload would fail/crash as per issue description)
            # 2. File uploaded
            # 3. UI updated
            try:
                # We expect the 'disabled' attribute to be removed
                # wait_for function: checks until predicate is true
                page.wait_for_function("""
                    () => {
                        const btn = document.querySelector("button.bg-gradient-to-r.from-indigo-600");
                        // Or match by text
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const magicBtn = buttons.find(b => b.textContent.includes('Magicky vygenerovat'));
                        return magicBtn && !magicBtn.disabled;
                    }
                """, timeout=15000)
                print("Magic button became enabled! Auto-save and upload successful.")
            except Exception as e:
                print(f"FAILURE: Magic button did not become enabled. {e}")
                page.screenshot(path="upload_failure.png")
                sys.exit(1)

            print("SUCCESS: Content First flow verified.")

        except Exception as e:
            print(f"ERROR: {e}")
            page.screenshot(path="failure.png")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
