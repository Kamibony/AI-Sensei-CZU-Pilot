from playwright.sync_api import sync_playwright
import time
import random
import string
import os

def verify():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Navigating to root...")
            page.goto("http://localhost:5000/")

            # 1. Select Role
            print("Selecting Professor role...")
            # Use exact text match for the button or a locator inside the button
            page.click("text=Jsem Profesor")

            # 2. Switch to Registration
            print("Switching to Registration mode...")
            # Look for the link that switches to registration
            page.click("text=Registrujte se")

            # 3. Fill Registration Form
            unique_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
            email = f"prof_test_{unique_id}@example.com"
            password = "Password123!"
            name = f"Prof Test {unique_id}"

            print(f"Registering new user: {email}")
            page.fill("#register-name", name)
            page.fill("#register-email", email)
            page.fill("#register-password", password)

            # Submit Registration
            # The registration button is in the visible form
            page.click("button:has-text('Registrovat se')")

            # 4. Wait for Dashboard
            print("Waiting for dashboard...")
            # Expecting the dashboard to load. We can look for the main navigation or specific professor elements.
            # "Přehled" is usually the first menu item.
            page.wait_for_selector("text=Přehled", timeout=30000)
            print("Dashboard loaded.")

            # 5. Open Lesson Editor (Manual Create)
            print("Navigating to Lesson Editor...")
            # Click "Vytvořit manuálně" on the card
            page.click("text=Vytvořit manuálně")

            # 6. Fill Wizard Step 1
            print("Filling Wizard Step 1...")
            # Using placeholders seen in screenshot
            page.wait_for_selector("input[placeholder*='Např. Úvod']", timeout=10000)
            page.fill("input[placeholder*='Např. Úvod']", f"Test Lesson {unique_id}")
            # Subtitle
            page.fill("input[placeholder*='Stručný popis']", "Test Topic")
            # Subject (using the raw key seen in screenshot as fallback)
            # The screenshot showed 'professor.editor.subject_placeholder' inside the input
            # Use a generic input selector if the placeholder is unstable, e.g. the first input after label
            page.fill("input[list='subjects-list']", "Test Subject")

            # 7. Mock File Upload
            print("Uploading file...")
            # Create a dummy file
            with open("test_upload.txt", "w") as f:
                f.write("Dummy content for upload verification.")

            # Locate file input.
            page.set_input_files("input[type='file']", "test_upload.txt")

            # 8. Check for Auto-Save Toast
            # We implemented logic to show "Zakládám koncept..."
            print("Checking for Auto-save...")
            # Wait a bit for the auto-save to trigger and complete
            time.sleep(5)

            # 9. Trigger Magic Generation
            print("Clicking Magic Generation...")
            # Button with text "Magické generování" (from JS code: lesson.magic_btn)
            # or the button that says "AI Sensei kouzlí" if loading?
            # From JS: ${translationService.t('lesson.magic_btn')} -> 'Magické generování' or similar.
            # In English it might be "Create Magic".
            # Looking at the button classes: bg-gradient-to-r from-indigo-600...
            # It also has an icon ✨.
            # Let's try matching the text "Magické generování" or closest match.
            # Checking JS again: translationService.t('lesson.magic_btn')
            # Assuming it translates to something with "Magick" or "Magic".
            # Or we can click the button next to "Vytvořit manuálně".

            # Using a more specific selector if possible or text.
            # The button has ✨ icon.
            page.click("button:has-text('✨')")

            # 10. Verify Success
            # If successful, it should proceed to generation view or show a success message.
            # If it fails (403), we might see an error toast.

            # Let's wait and see if we get redirected or if an error appears.
            print("Waiting for generation/save...")
            # Wait for spinner or transition
            time.sleep(10)

            # Check for error toasts
            if page.locator(".toast-error").is_visible():
                error_text = page.locator(".toast-error").inner_text()
                print(f"FAILURE: Error toast detected: {error_text}")
                page.screenshot(path="failure_toast.png")
            else:
                # If we transitioned to Hub mode, the wizard should be gone.
                # Wizard has "Vytvořit manuálně" button. Hub doesn't.
                if page.locator("text=Vytvořit manuálně").is_visible():
                     print("FAILURE: Still in Wizard mode. Generation might have failed silently.")
                     page.screenshot(path="failure_wizard.png")
                else:
                     print("SUCCESS: Wizard mode exited. Assuming generation started/completed.")
                     page.screenshot(path="success_magic.png")

        except Exception as e:
            print(f"TEST FAILED: {e}")
            page.screenshot(path="failure_exception.png")
            raise
        finally:
            if os.path.exists("test_upload.txt"):
                os.remove("test_upload.txt")
            browser.close()

if __name__ == "__main__":
    verify()
