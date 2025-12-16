import time
from playwright.sync_api import sync_playwright

def verify_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context()
        page = context.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        try:
            print("Navigating to root...")
            page.goto("http://localhost:5000/")
            page.wait_for_load_state("networkidle")
            print(f"Initial URL: {page.url}")

            # 1. Role Selection
            print("Looking for Role Selection...")
            page.wait_for_timeout(2000)

            prof_text = page.get_by_text("Jsem Profesor")
            if prof_text.count() > 0:
                print("Clicking 'Jsem Profesor' text...")
                prof_text.first.click()
            elif page.is_visible("#professor-btn"):
                 print("Clicking '#professor-btn'...")
                 page.click("#professor-btn")
            else:
                print("No Role button found. Assuming on Login/Register page.")

            # 2. Registration
            print("Switching to Registration mode...")
            page.wait_for_timeout(1000)

            # Look for specific Czech translation "Registrujte se"
            reg_link = page.get_by_text("Registrujte se", exact=False)
            if reg_link.count() > 0 and reg_link.first.is_visible():
                print("Found 'Registrujte se' link. Clicking...")
                reg_link.first.click()
            else:
                print("Link 'Registrujte se' not visible. Checking 'Registrovat'...")
                reg_alt = page.get_by_text("Registrovat", exact=False)
                if reg_alt.count() > 0 and reg_alt.first.is_visible():
                     reg_alt.first.click()

            # Fill registration - USE SPECIFIC IDs
            email = f"prof_debug_{int(time.time())}@example.com"
            print(f"Registering new user: {email}")

            # Wait for specific register email input
            page.wait_for_selector("#register-email", state="visible", timeout=10000)
            page.fill("#register-email", email)

            # Name
            page.fill("#register-name", "Test Professor")

            # Password
            page.fill("#register-password", "password123")

            # Submit
            # Click the visible button inside the register form container?
            # Or assume the one with "Registrovat se" text is correct
            reg_submit = page.locator("button", has_text="Registrovat se") # Button text from auth.register_btn
            if reg_submit.is_visible():
                reg_submit.click()
            else:
                # Fallback to generic submit, but be careful of hidden one
                # Filter by visibility
                visible_submit = page.locator("button[type='submit']").filter(has_text=lambda t: True).first
                visible_submit.click()

            # 3. Wait for Dashboard
            print("Waiting for dashboard...")
            page.wait_for_selector("#professor-sidebar", timeout=20000)
            print("Dashboard loaded.")

            # 4. REFRESH to ensure Custom Claims (role: professor) are picked up
            print("Refeshing page to ensure token claims...")
            page.reload()
            page.wait_for_selector("#professor-sidebar", timeout=20000)
            print("Dashboard reloaded.")

            # 5. Navigate to Lesson Editor
            print("Navigating to Lesson Editor...")
            page.click("text=Editor lekcí")

            # 6. Wizard Interaction
            print("Filling Wizard Step 1...")
            page.wait_for_selector("text=Nová lekce", timeout=10000)

            # Title - using placeholder
            page.fill("input[placeholder*='Např. Úvod']", "Test Magic Lesson")

            # Subject - using list attribute
            page.fill("input[list='subjects-list']", "Test Subject")

            # 7. Upload File
            print("Uploading file...")
            with page.expect_file_chooser() as fc_info:
                page.set_input_files("input[type='file']", "test_upload.txt")

            # 8. Check for Auto-save & Upload Success
            print("Checking for Auto-save and Upload...")
            try:
                page.wait_for_selector("text=test_upload.txt", timeout=15000)
                print("File 'test_upload.txt' appears in the UI list. Upload SUCCESS.")
            except Exception as e:
                print("File did NOT appear in the list. Upload FAILED.")
                error_toast = page.locator(".Toastify__toast--error")
                if error_toast.count() > 0:
                    print(f"ERROR TOAST FOUND: {error_toast.first.inner_text()}")
                page.screenshot(path="failure_upload_list.png")
                raise e

            # 9. Magic Generation
            print("Clicking Magic Generation...")
            magic_btn = page.locator("button").filter(has_text="Magické generování")

            if magic_btn.count() == 0:
                 magic_btn = page.get_by_text("Magické generování", exact=False)

            if magic_btn.is_disabled():
                print("Magic button is DISABLED. Files not recognized.")
                page.screenshot(path="failure_magic_disabled.png")
            else:
                magic_btn.click()

            # 10. Wait for success (Exit Wizard)
            print("Waiting for transition to Hub...")
            try:
                page.wait_for_selector("text=Obsah lekce", timeout=20000)
                print("SUCCESS: Transitioned to Hub. Magic generation started/saved.")
                page.screenshot(path="success_magic_debug.png")
            except Exception as e:
                print("FAILURE: Did not transition to Hub.")
                page.screenshot(path="failure_no_hub.png")
                raise e

        except Exception as e:
            print(f"TEST EXCEPTION: {e}")
            page.screenshot(path="failure_exception.png")
        finally:
            browser.close()

if __name__ == "__main__":
    with open("test_upload.txt", "w") as f:
        f.write("This is a test content for RAG processing.")
    verify_fix()
