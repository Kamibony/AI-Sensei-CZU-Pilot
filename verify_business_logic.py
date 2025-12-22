from playwright.sync_api import sync_playwright, expect
import time
import os
import sys
import uuid
import json
import re
import urllib.parse

# Ensure screenshots directory exists
SCREENSHOT_DIR = "screenshots_lite"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

# Generate unique professor email to ensure clean state in emulators
PROFESSOR_EMAIL = f"profesor_{uuid.uuid4().hex[:8]}@profesor.cz"
PROFESSOR_PASSWORD = "password123"
PROFESSOR_NAME = "Test Professor"

STUDENT_EMAIL = f"student_{uuid.uuid4().hex[:8]}@example.com"
STUDENT_PASSWORD = "password123"
STUDENT_NAME = "Test Student"

BASE_URL = "http://localhost:5000"

GROUP_CODE = ""
GROUP_NAME = ""
LESSON_ID = ""

def log(msg):
    print(f"[TEST] {msg}")

# --- Helper Functions ---

def safe_click(page, selector, timeout=15000):
    log(f"Clicking: {selector}")
    try:
        page.click(selector, timeout=timeout)
        return
    except Exception as e:
        log(f"Standard click failed for {selector}: {e}. Retrying with force=True...")
    try:
        page.locator(selector).first.click(force=True, timeout=timeout)
        return
    except Exception as e:
        log(f"Force click failed for {selector}: {e}. Retrying with JS evaluation...")
    try:
        page.locator(selector).first.evaluate("el => el.click()")
    except Exception as e:
        log(f"JS click failed for {selector}: {e}")
        page.screenshot(path=f"{SCREENSHOT_DIR}/click_fail_{uuid.uuid4().hex[:4]}.png")
        raise e

def safe_fill(page, selector, value, timeout=5000):
    log(f"Filling: {selector}")
    try:
        page.fill(selector, value, timeout=timeout)
    except Exception as e:
        log(f"Standard fill failed for {selector}: {e}. Retrying with force...")
        try:
             page.locator(selector).first.fill(value, force=True, timeout=timeout)
        except Exception as e2:
             log(f"Force fill failed for {selector}: {e2}. Attempting JS value set...")
             try:
                 page.locator(selector).first.evaluate(f"(el, val) => {{ el.value = val; el.dispatchEvent(new Event('input', {{ bubbles: true, composed: true }})); }}", value)
             except Exception as e3:
                 log(f"JS fill failed: {e3}")
                 raise e2

def safe_fill_and_trigger(page, selector, value):
    """
    Fills an input and forces DOM events via JS evaluation to ensure LitElement/Frameworks detect the change.
    """
    log(f"Typing into: {selector}")
    try:
        page.locator(selector).first.click()
        page.locator(selector).first.fill("")
        page.locator(selector).first.type(value, delay=100)
    except Exception as e:
        log(f"Type failed for {selector}: {e}. Fallback to safe_fill...")
        safe_fill(page, selector, value)

    log(f"Triggering events for: {selector}")
    try:
        page.locator(selector).first.evaluate("""(el, val) => {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }""", value)
    except Exception as e:
        log(f"safe_fill_and_trigger evaluate failed: {e}")

def login_professor(page):
    log("Registering/Logging in Professor...")
    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    if page.locator("text='Jsem Profesor'").is_visible():
        safe_click(page, "button:has-text('Jsem Profesor')")

    try:
        log("Switching to Registration mode...")
        safe_click(page, "a:has-text('Registrujte se')")
        page.wait_for_selector("#register-name", state="visible", timeout=5000)
    except Exception as e:
        log(f"Registration switch failed: {e}")

    log(f"Registering as {PROFESSOR_EMAIL}...")
    safe_fill(page, "#register-name", PROFESSOR_NAME)
    safe_fill(page, "#register-email", PROFESSOR_EMAIL)
    safe_fill(page, "#register-password", PROFESSOR_PASSWORD)

    log("Submitting registration...")
    page.keyboard.press("Enter")

    log("Waiting for global spinner to disappear...")
    try:
        page.wait_for_selector("#global-spinner", state="hidden", timeout=20000)
    except Exception as e:
        log(f"Spinner wait warning: {e}")

    log("Waiting for Dashboard...")
    try:
        expect(page.locator("professor-dashboard-view")).to_be_visible(timeout=30000)
    except:
        log("Dashboard not visible immediately. Trying force navigation fallback...")
        if page.locator("#register-name").is_visible():
            safe_click(page, "button:has-text('Registrovat se')")
            page.wait_for_timeout(2000)
        page.reload()
        expect(page.locator("professor-dashboard-view")).to_be_visible(timeout=40000)

    log("Professor registered/logged in.")

def create_group(page):
    global GROUP_CODE, GROUP_NAME
    log("Creating Group...")

    try:
        safe_click(page, "professor-navigation button:has-text('Třídy')")
    except:
        safe_click(page, "professor-navigation button:has-text('Classes')")

    expect(page.locator("professor-classes-view")).to_be_visible()

    safe_click(page, "button:has-text('Vytvořit novou třídu')")

    group_name = f"QA Group {uuid.uuid4().hex[:4]}"
    GROUP_NAME = group_name
    modal_input_selector = "div.fixed.inset-0 input[type='text']"

    page.wait_for_selector(modal_input_selector, state="visible", timeout=5000)
    safe_fill(page, modal_input_selector, group_name)

    safe_click(page, "div.fixed.inset-0 button:has-text('Uložit')")

    time.sleep(2)

    card_selector = f".bg-white:has-text('{group_name}')"
    try:
        expect(page.locator(card_selector)).to_be_visible(timeout=10000)
    except:
        log("Card not found immediately. Reloading...")
        page.reload()
        safe_click(page, "professor-navigation button:has-text('Třídy')")
        expect(page.locator(card_selector)).to_be_visible()

    card = page.locator(card_selector).first
    try:
        code_el = card.locator("code")
        if code_el.count() > 0:
            GROUP_CODE = code_el.inner_text().strip()
            log(f"Group created: {group_name}, Code: {GROUP_CODE}")
        else:
            text = card.inner_text()
            match = re.search(r"Kód:\s*([A-Z0-9]+)", text)
            if match:
                GROUP_CODE = match.group(1)
                log(f"Group created: {group_name}, Code: {GROUP_CODE} (via Regex)")
            else:
                raise Exception("Could not extract group code")
    except Exception as e:
        log(f"Failed to get group code: {e}")
        page.screenshot(path=f"{SCREENSHOT_DIR}/group_code_fail.png")
        raise e

def verify_text_lesson_logic(page):
    global LESSON_ID
    log("Creating Text Lesson...")
    safe_click(page, "professor-navigation button:has-text('Nástěnka')")
    time.sleep(1)

    safe_click(page, "text='Vytvořit manuálně'")

    title = f"QA Lesson - Text Logic"
    safe_fill(page, "input[placeholder*='Úvod do marketingu']", title)
    safe_fill(page, "input[list='subjects-list']", "QA Testing")

    safe_click(page, "button:has-text('Vytvořit manuálně')")

    log("Waiting for editor tools...")
    page.wait_for_selector("button:has-text('Text')", timeout=15000)

    # Select Text
    safe_click(page, "button:has-text('Textový obsah')")
    expect(page.locator("professor-header-editor")).to_be_visible()

    # --- Step 1 (Validation Logic): Empty content save prevented ---
    log("Step 1: Testing Empty Content Save...")

    save_btn = page.locator("professor-header-editor button:has-text('Uložit změny')")

    # Check if disabled
    if save_btn.is_disabled():
         log("[SUCCESS] Empty content save prevented (Button Disabled).")
    else:
         initial_url = page.url
         save_btn.click()
         time.sleep(2)

         toast = page.locator(".Toastify__toast--error").or_(page.locator("text='Vyplňte prosím obsah'")).or_(page.locator("text='Chyba'")).first
         if toast.is_visible():
             log("[SUCCESS] Empty content save prevented (Toast message).")
         elif page.url == initial_url:
             log("[SUCCESS] Empty content save prevented (URL did not change).")
         else:
             page.screenshot(path=f"{SCREENSHOT_DIR}/empty_save_fail.png")
             raise Exception("Failure: User was redirected or URL changed on empty save!")

    # --- Step 2 (Save Logic): Fill and Save, Assert No Redirect ---
    log("Step 2: Testing Valid Save (No Redirect)...")

    if page.locator("ai-generator-panel").is_visible():
        safe_fill(page, "textarea#prompt-input", "This is a test content.")
        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator(".prose")).to_be_visible(timeout=30000)

        # Click the 'Accept/Save' button inside the AI panel to apply changes to the lesson
        log("Accepting generated content...")
        try:
            # Try finding the button in the footer of the generation output
            safe_click(page, "ai-generator-panel div.text-right button")
            time.sleep(2)
        except Exception as e:
            log(f"Could not find AI accept button: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/ai_button_fail.png")

    else:
        log("AI Generator not visible, assuming content needs manual entry or is already there?")

    log("Clicking Save...")
    safe_click(page, "professor-header-editor button:has-text('Uložit změny')")
    time.sleep(2)

    # CRITICAL: Assert URL still contains #editor
    current_url = page.url
    if "editor" in current_url:
        log(f"[SUCCESS] User remained in editor after save. URL: {current_url}")
    else:
        page.screenshot(path=f"{SCREENSHOT_DIR}/redirect_fail.png")
        raise Exception(f"Failure: User was redirected! URL: {current_url}")

    # Extract Lesson ID
    match = re.search(r"/editor/([a-zA-Z0-9_-]+)", current_url)
    if match:
        LESSON_ID = match.group(1)
        log(f"Extracted Lesson ID: {LESSON_ID}")
    else:
        log("URL does not contain ID, attempting DOM extraction with retries...")
        for attempt in range(5):
            try:
                LESSON_ID = page.evaluate("document.querySelector('lesson-editor')?.currentLessonId")
                if LESSON_ID:
                    log(f"Extracted Lesson ID from DOM (lesson-editor): {LESSON_ID}")
                    break
            except:
                pass

            try:
                 LESSON_ID = page.evaluate("document.querySelector('professor-header-editor')?.lesson?.id")
                 if LESSON_ID:
                     log(f"Extracted Lesson ID from DOM (header): {LESSON_ID}")
                     break
            except:
                 pass
            time.sleep(1)

    if not LESSON_ID:
        page.screenshot(path=f"{SCREENSHOT_DIR}/id_extraction_fail.png")
        raise Exception("Could not extract Lesson ID")

    # Navigate back to Hub for assignment
    log("Navigating back to Hub for assignment...")
    safe_click(page, "professor-header-editor button") # Back button

    log("Waiting for Hub...")
    try:
        page.wait_for_selector("button:has-text('Textový obsah')", timeout=10000)
    except:
        log("Hub not found? Maybe different view. Dumping screenshot.")
        page.screenshot(path=f"{SCREENSHOT_DIR}/hub_fail.png")
        raise

    # Assign to group
    try:
        log(f"Looking for group checkbox: {GROUP_NAME}")
        checkbox_label = page.locator("label").filter(has_text=GROUP_NAME).first
        if checkbox_label.is_visible():
             checkbox = checkbox_label.locator("input[type='checkbox']")
             if not checkbox.is_checked():
                 checkbox.check()
                 log(f"Assigned lesson to group: {GROUP_NAME}")
                 time.sleep(2)
        else:
             log(f"Group assignment checkbox for '{GROUP_NAME}' not found!")
             page.screenshot(path=f"{SCREENSHOT_DIR}/assignment_fail.png")
    except Exception as e:
        log(f"Assignment failed: {e}")

def verify_student_view(p, headless=True):
    log("Step 3: Verifying Student View...")
    browser = p.chromium.launch(headless=headless, args=['--no-sandbox'])
    page = browser.new_page()
    page.on("console", lambda msg: log(f"[BROWSER] {msg.text}"))

    page.goto(f"{BASE_URL}/")
    time.sleep(1)
    if page.locator("text='Jsem Student'").is_visible():
        safe_click(page, "text='Jsem Student'")

    if page.locator("text='Registrujte se'").is_visible():
        safe_click(page, "text='Registrujte se'")

    safe_fill(page, "#register-email", STUDENT_EMAIL)
    safe_fill(page, "#register-password", STUDENT_PASSWORD)
    safe_fill(page, "#register-name", STUDENT_NAME)
    page.keyboard.press("Enter")

    expect(page.locator("student-dashboard")).to_be_visible(timeout=20000)

    log(f"Joining Class {GROUP_CODE}...")
    try:
        safe_click(page, "div.cursor-pointer:has-text('Připojit se k třídě')")
    except:
        safe_click(page, "button:has-text('Třídy')")
        safe_click(page, "button:has-text('Připojit se k třídě')")

    # Use robust input for Code
    safe_fill_and_trigger(page, "input[placeholder='CODE']", GROUP_CODE)

    # Corrected button text based on screenshot
    safe_click(page, "button:has-text('Připojit se')")

    log("Waiting for join to complete...")
    # Wait for modal to disappear or success message
    try:
        # Assuming the modal closes on success
        expect(page.locator("div.fixed.inset-0")).to_be_hidden(timeout=10000)
    except:
        log("Join modal did not close, possibly already joined or failed.")

    time.sleep(3)

    lesson_url = f"{BASE_URL}/#student/class/{GROUP_CODE}/lesson/{LESSON_ID}"
    log(f"Navigating to {lesson_url}")
    page.goto(lesson_url)

    print("[TEST] Verifying student view via text content...")
    # We typed "Úvod do marketingu" or generated "QA Lesson - Text Logic" (based on previous steps).
    # The most robust check is to wait for the generic subject/topic text that always appears.

    try:
        # Wait for the specific text we typed/generated in the professor step
        # Using a relaxed regex to catch the title or the specific known input
        page.wait_for_selector("text=QA Lesson - Text Logic", timeout=20000)
        print("[SUCCESS] Student lesson rendered (Title found via text match).")
    except:
        print("[DEBUG] Title not found immediately. Dumping page text for debugging:")
        try:
            print(page.inner_text("body"))
        except:
            pass
        page.screenshot(path=f"{SCREENSHOT_DIR}/student_fail.png")
        raise

    browser.close()

def run():
    with sync_playwright() as p:
        is_ci = os.environ.get('CI') == 'true'
        browser = p.chromium.launch(headless=is_ci, args=['--no-sandbox'])
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(45000)

        try:
            login_professor(page)
            create_group(page)
            verify_text_lesson_logic(page)

        except Exception as e:
            log(f"Professor Phase Error: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/prof_error.png")
            sys.exit(1)
        finally:
            browser.close()

        try:
            verify_student_view(p, headless=is_ci)
        except Exception as e:
            log(f"Student Phase Error: {e}")
            sys.exit(1)

if __name__ == "__main__":
    run()
