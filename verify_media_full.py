import time
import re
from playwright.sync_api import sync_playwright, expect

def run():
    print("[TEST] Starting Full Media Verification (Audio & Comic)...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"[BROWSER] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[BROWSER ERROR] {err}"))

        try:
            # 1. Access the app
            print("[TEST] Navigating to app...")
            page.goto("http://127.0.0.1:5000/")
            page.wait_for_load_state("networkidle")

            # 2. Authentication Strategy (Try Reg, then Fallback to Admin)
            print("[TEST] Attempting Authentication...")

            # Initial Button Click
            if page.is_visible("text=Jsem Profesor"):
                page.click("text=Jsem Profesor")
            elif page.is_visible("text=Vstoupit jako profesor"):
                page.click("text=Vstoupit jako profesor")

            # Wait for form
            page.wait_for_selector("input[type='email']", timeout=10000)

            # Strategy: Login as known Admin to bypass registration flakiness
            print("[TEST] Logging in as Admin (profesor@profesor.cz)...")

            # Switch to login if on register
            if page.is_visible("#register-name"):
                 if page.is_visible("text=Přihlaste se"):
                     page.click("text=Přihlaste se")
                 elif page.is_visible("text=Už máte účet?"):
                     page.click("text=Už máte účet?") # Or similar link

            time.sleep(1)

            # Fill Login
            page.fill("#login-email", "profesor@profesor.cz")
            page.fill("#login-password", "password")

            # Click Login Button
            # Selector: button with type submit inside form, or text "Přihlásit se"
            page.click("button[type='submit']")

            # 3. Wait for Dashboard
            print("[TEST] Waiting for Dashboard...")
            try:
                expect(page.locator("h1")).to_contain_text("Učitelský panel", timeout=20000)
                print("[TEST] Successfully logged in as Admin.")
            except AssertionError:
                print("[TEST] Login failed or slow redirect. Dumping page content...")
                # page.screenshot(path="login_fail.png")
                raise Exception("Failed to reach Dashboard")

            # 4. Create New Lesson
            print("[TEST] Creating New Lesson...")
            if page.is_visible("text=Vytvořit novou lekci"):
                page.click("text=Vytvořit novou lekci")
            else:
                page.click("text=Nová lekce")

            print("[TEST] Filling Wizard...")
            page.wait_for_selector("input[type='text']", timeout=10000)
            timestamp = int(time.time())
            page.fill("input[placeholder*='Např. Úvod']", f"Media Test {timestamp}")
            page.fill("input[placeholder*='Stručný popis']", "Testing Audio and Imagen")

            # Navigate through wizard
            if page.is_visible("button:has-text('Dále')"):
                page.click("button:has-text('Dále')")
            time.sleep(1)
            if page.is_visible("button:has-text('Dále')"):
                page.click("button:has-text('Dále')")

            print("[TEST] Selecting Manual Mode...")
            page.click("button:has-text('Vytvořit manuálně')")

            print("[TEST] Waiting for Lesson Hub...")
            expect(page.locator("text=Obsah lekce")).to_be_visible(timeout=10000)

            # ==========================================
            # TEST CASE 1: AUDIO (Podcast)
            # ==========================================
            print("\n[TEST] === Starting Audio Tests ===")
            page.click("text=Podcast")
            # Wait for component to load
            # If it shows AI panel first, we need to generate script
            if page.locator("ai-generator-panel").is_visible():
                print("[TEST] Generating Placeholder Script...")
                page.locator("ai-generator-panel button").filter(has_text=re.compile("Generovat", re.IGNORECASE)).first.click()
                # Wait for Save button
                save_btn = page.locator("ai-generator-panel button").filter(has_text=re.compile("Uložit", re.IGNORECASE))
                expect(save_btn).to_be_visible(timeout=60000) # AI might be slow
                save_btn.click()

            expect(page.locator("editor-view-audio")).to_be_visible()
            print("[TEST] Audio Editor Loaded.")

            # Ensure there is text
            first_textarea = page.locator("textarea").first
            if not first_textarea.input_value():
                first_textarea.fill("This is a test line for audio generation.")

            # Click Generate
            gen_audio_btn = page.locator("button").filter(has_text="Generovat Audio")
            gen_audio_btn.click()
            print("[TEST] Clicked Generate Audio...")

            # Wait for Audio Player
            expect(page.locator("audio")).to_be_visible(timeout=60000)
            print("[TEST] Audio Player Visible!")

            # Go Back
            page.locator("professor-header-editor button").first.click()

            # ==========================================
            # TEST CASE 2: COMIC (Images)
            # ==========================================
            print("\n[TEST] === Starting Comic Tests ===")
            page.click("text=Komiks")

            if page.locator("ai-generator-panel").is_visible():
                print("[TEST] Generating Placeholder Comic Script...")
                page.locator("ai-generator-panel button").filter(has_text=re.compile("Generovat", re.IGNORECASE)).first.click()
                save_btn = page.locator("ai-generator-panel button").filter(has_text=re.compile("Uložit", re.IGNORECASE))
                expect(save_btn).to_be_visible(timeout=60000)
                save_btn.click()

            expect(page.locator("editor-view-comic")).to_be_visible()
            print("[TEST] Comic Editor Loaded.")

            # Find first panel
            first_card = page.locator(".grid > div").first

            # Ensure description
            desc_area = first_card.locator("textarea").first
            if not desc_area.input_value():
                desc_area.fill("A futuristic robot teacher in a classroom.")

            # Click Generate Image
            gen_img_btn = first_card.locator("button").filter(has_text="Generovat Obrázek")
            gen_img_btn.click()
            print("[TEST] Clicked Generate Image...")

            # Wait for Image (replacing the button/spinner)
            expect(first_card.locator("img")).to_be_visible(timeout=60000)
            src = first_card.locator("img").get_attribute("src")
            print(f"[TEST] Image Generated! Src: {src[:50]}...")

            print("\n[TEST] ALL MEDIA TESTS PASSED SUCCESSFULLY.")

        except Exception as e:
            print(f"[TEST] FAILED: {e}")
            page.screenshot(path="media_test_failure.png")
            print("[TEST] Screenshot saved to media_test_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    run()
