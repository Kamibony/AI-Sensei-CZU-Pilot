
import re
from playwright.sync_api import sync_playwright, expect
import time
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Add a listener for all console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        # Add a listener for page errors
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            print("Navigating to the application...")
            page.goto("http://127.0.0.1:5000", timeout=60000)

            # Hide the emulator warning to prevent it from interfering with clicks
            page.evaluate("""
                const style = document.createElement('style');
                style.innerHTML = '.firebase-emulator-warning { display: none !important; }';
                document.head.appendChild(style);
            """)

            print("Waiting for and clicking the 'Enter as Professor' button...")
            professor_button = page.get_by_role("button", name="Vstoupit jako profesor")
            expect(professor_button).to_be_visible(timeout=30000)
            professor_button.click()

            print("Now on the login page. Attempting registration first for robustness.")

            # --- Register-then-Login Strategy ---
            try:
                # Navigate to registration page
                register_link = page.get_by_role("link", name="Zaregistrujte se")
                expect(register_link).to_be_visible(timeout=10000)
                print("Clicking registration link...")
                register_link.click()

                # Fill out registration form
                print("Filling registration form...")
                page.locator("#register-email").fill("profesor@profesor.cz")
                page.locator("#register-password").fill("password")

                # Use a more specific locator for the registration button
                register_button = page.locator("form[action='/register'] button[type='submit']")
                expect(register_button).to_be_visible(timeout=10000)
                print("Clicking register button...")
                register_button.click()

                # Wait for a moment to see if registration succeeds or fails
                # It's expected to fail if user exists, which is fine.
                time.sleep(5)

            except Exception as e:
                print(f"Registration attempt failed (this is okay if user exists): {e}")
                # If it fails, we might be on the login page or need to navigate back
                if "login" not in page.url:
                    page.goto("http://127.0.0.1:5000", timeout=60000)
                    page.get_by_role("button", name="Vstoupit jako profesor").click()

            # --- Proceed with Login ---
            print("Attempting to log in...")
            login_form = page.locator("form[action='/login']")
            expect(login_form).to_be_visible(timeout=10000)

            login_form.locator("#login-email").fill("profesor@profesor.cz")
            login_form.locator("#login-password").fill("password")

            print("Clicking login button...")
            login_button = login_form.get_by_role("button", name="Přihlásit se")
            login_button.click()

            print("Verifying successful login by checking for the dashboard heading...")
            dashboard_heading = page.get_by_role("heading", name=re.compile("Vítejte zpět,"))
            expect(dashboard_heading).to_be_visible(timeout=30000)
            print("Login successful! Dashboard is visible.")

            # --- Feature Verification ---
            print("\nStarting Comic Feature Verification...")

            print("1. Navigating to the Lesson Library ('Knihovna Lekcí')...")
            # Using the ID for the specific sidebar link
            lesson_library_link = page.locator("#sidebar-link-library")
            expect(lesson_library_link).to_be_visible(timeout=15000)
            lesson_library_link.click()

            print("2. Clicking the 'Vytvořit novou lekci' (Create new lesson) button...")
            create_lesson_button = page.get_by_role("button", name="Vytvořit novou lekci")
            expect(create_lesson_button).to_be_visible(timeout=15000)
            create_lesson_button.click()

            print("3. Verifying the 'Komiks' content type is present...")
            comic_type_card = page.locator("div.content-type-card[data-id='comic']")
            expect(comic_type_card).to_be_visible(timeout=10000)
            expect(comic_type_card.get_by_text("Komiks")).to_be_visible()
            print("'Komiks' content type found.")

            print("4. Clicking 'Komiks' and then 'Vybrat' (Select)...")
            comic_type_card.click()
            select_button = page.get_by_role("button", name="Vybrat")
            select_button.click()

            print("5. Filling in lesson title...")
            title_input = page.locator("#lesson-title")
            expect(title_input).to_be_visible(timeout=10000)
            lesson_title = f"Comic Test {int(time.time())}"
            title_input.fill(lesson_title)

            print("6. Clicking 'Uložit a pokračovat' (Save and continue)...")
            save_button = page.locator("#save-lesson-btn")
            save_button.click()

            print("7. Clicking the 'Magic' generation button...")
            magic_button = page.get_by_role("button", name="Vytvořit obsah pomocí AI")
            expect(magic_button).to_be_visible(timeout=10000)
            magic_button.click()

            print("8. Verifying the Comic Editor view is now visible...")
            comic_editor = page.locator("editor-view-comic")
            expect(comic_editor).to_be_visible(timeout=60000) # Increased timeout for AI generation

            header = comic_editor.get_by_role("heading", name="Komiksový Editor")
            expect(header).to_be_visible()
            print("Comic editor is visible.")

            print("9. Verifying that 4 panels have been generated with text content...")
            panels = comic_editor.locator(".grid > div")
            expect(panels).to_have_count(4, timeout=20000)

            # Check that the first panel has some generated text in its textareas
            first_panel = panels.first
            description_textarea = first_panel.locator("textarea[placeholder='Vizuální popis']")
            dialogue_textarea = first_panel.locator("textarea[placeholder='Dialog']")

            expect(description_textarea).not_to_have_value("", timeout=20000)
            # Dialogue can sometimes be empty, so this check isn't as critical
            # expect(dialogue_textarea).not_to_have_value("")

            print("Panel script content has been generated successfully.")

            print("10. Testing the image generation for the first panel...")
            generate_button = first_panel.get_by_role("button", name="Generovat tento panel")
            expect(generate_button).to_be_visible()
            generate_button.click()

            print("11. Verifying that a placeholder image appears...")
            # The mock function returns a base64 string, which will be in an <img> tag
            generated_image = first_panel.locator("img[src^='data:image/png;base64,']")
            expect(generated_image).to_be_visible(timeout=30000) # Wait for generation
            print("Image generated successfully for the first panel.")

            print("\n✅ Comic Strip Feature Verification Successful!")

        except Exception as e:
            print(f"\n❌ Verification failed: {e}")
            screenshot_path = os.path.join("/home/jules/verification/screenshots", "error_screenshot.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")
            raise

        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
