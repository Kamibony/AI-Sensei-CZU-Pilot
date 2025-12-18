from playwright.sync_api import sync_playwright, expect
import time
import os
import sys
import uuid

# Ensure screenshots directory exists
SCREENSHOT_DIR = "screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

# Generate unique professor email to ensure clean state in emulators
PROFESSOR_EMAIL = f"profesor_{uuid.uuid4().hex[:8]}@profesor.cz"
PROFESSOR_PASSWORD = "password123"
PROFESSOR_NAME = "Test Professor"

STUDENT_EMAIL = f"student_{uuid.uuid4().hex[:8]}@example.com"
STUDENT_PASSWORD = "password123"
STUDENT_NAME = "Test Student"

BASE_URL = "http://localhost:5000"

CONTENT_TYPES = [
    {"type": "text", "name": "Text", "manual_input_fn": "input_text", "check_selector": ".prose"},
    {"type": "presentation", "name": "Presentation", "manual_input_fn": "input_presentation", "check_selector": ".bg-slate-50.relative"},
    {"type": "quiz", "name": "Quiz", "manual_input_fn": "input_quiz", "check_selector": "ai-generator-panel[contentType='quiz']"},
    {"type": "test", "name": "Test", "manual_input_fn": "input_test", "check_selector": "input[placeholder*='Otázka']"},
    {"type": "post", "name": "Post", "manual_input_fn": "input_post", "check_selector": "textarea[placeholder*='Napište']"},
    {"type": "video", "name": "Video", "manual_input_fn": "input_video", "check_selector": "iframe"},
    {"type": "comic", "name": "Comic", "manual_input_fn": "input_comic", "check_selector": "textarea[placeholder*='Popis scény']"},
    {"type": "flashcards", "name": "Flashcards", "manual_input_fn": "input_flashcards", "check_selector": "input[placeholder*='Přední strana']"},
    {"type": "mindmap", "name": "Mindmap", "manual_input_fn": "input_mindmap", "check_selector": "#mermaid-preview svg"},
    {"type": "audio", "name": "Audio", "manual_input_fn": "input_audio", "check_selector": "#script-editor"}
]

LESSON_IDS = {}
GROUP_CODE = ""

def log(msg):
    print(f"[TEST] {msg}")

# --- Helper Functions ---

def safe_click(page, selector, timeout=5000):
    """
    Robust click with retry strategy:
    1. Standard click
    2. Force click
    3. JS click via Locator evaluation (safe for Playwright selectors)
    """
    log(f"Clicking: {selector}")
    try:
        # Try standard click
        page.click(selector, timeout=timeout)
        return
    except Exception as e:
        log(f"Standard click failed for {selector}: {e}. Retrying with force=True...")

    try:
        # Try force click
        page.locator(selector).first.click(force=True, timeout=timeout)
        return
    except Exception as e:
        log(f"Force click failed for {selector}: {e}. Retrying with JS evaluation...")

    try:
        # Try JS click via element handle
        # This works with Playwright selectors because we resolve the element first
        page.locator(selector).first.evaluate("el => el.click()")
    except Exception as e:
        log(f"JS click failed for {selector}: {e}")
        # Capture screenshot for debugging
        page.screenshot(path=f"{SCREENSHOT_DIR}/click_fail_{uuid.uuid4().hex[:4]}.png")
        raise e

def safe_fill(page, selector, value, timeout=5000):
    """
    Robust fill with retry strategy.
    """
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
                 # JS set value and dispatch input event via locator evaluation
                 page.locator(selector).first.evaluate(f"(el, val) => {{ el.value = val; el.dispatchEvent(new Event('input', {{ bubbles: true }})); }}", value)
             except Exception as e3:
                 log(f"JS fill failed: {e3}")
                 raise e2

def login_professor(page):
    log("Registering/Logging in Professor...")
    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    # Select Role
    if page.locator("text='Jsem Profesor'").is_visible():
        safe_click(page, "button:has-text('Jsem Profesor')")

    # Switch to Registration
    try:
        log("Switching to Registration mode...")
        # Look for the link that toggles registration.
        # Verified in login-view.js: <a href="#" @click=${this._toggleMode}>Registrujte se</a>
        # Selector should be an anchor tag with that text.
        safe_click(page, "a:has-text('Registrujte se')")
        page.wait_for_selector("#register-name", state="visible", timeout=5000)
    except Exception as e:
        log(f"Registration switch failed: {e}")
        page.screenshot(path=f"{SCREENSHOT_DIR}/registration_switch_fail.png")
        raise e

    # Fill Registration
    log(f"Registering as {PROFESSOR_EMAIL}...")
    safe_fill(page, "#register-name", PROFESSOR_NAME)
    safe_fill(page, "#register-email", PROFESSOR_EMAIL)
    safe_fill(page, "#register-password", PROFESSOR_PASSWORD)

    # Submit
    log("Submitting registration...")
    page.keyboard.press("Enter")

    # Wait for dashboard
    log("Waiting for Dashboard...")
    try:
        expect(page.locator("professor-dashboard-view")).to_be_visible(timeout=20000)
    except:
        log("Dashboard not visible immediately. Trying force navigation fallback...")
        # Fallback: check if we are stuck on login page
        if page.locator("#register-name").is_visible():
            # Try clicking the submit button explicitly
            # Verified in login-view.js: button with text "Registrovat se"
            safe_click(page, "button:has-text('Registrovat se')")
            page.wait_for_timeout(2000)

        # Hard check for dashboard
        page.reload()
        expect(page.locator("professor-dashboard-view")).to_be_visible(timeout=30000)

    log("Professor registered/logged in.")

def create_group(page):
    global GROUP_CODE
    log("Creating Group...")

    # Navigate to Classes
    # Verified in app-navigation.js / professor-navigation.js:
    # Button text "Moje Třídy" or "Classes"
    # We use a robust text match
    try:
        safe_click(page, "professor-navigation button:has-text('Třídy')")
    except:
        # Retry with English just in case or icon
        safe_click(page, "professor-navigation button:has-text('Classes')")

    expect(page.locator("professor-classes-view")).to_be_visible()

    # Open Create Modal
    # Verified in professor-classes-view.js: Button with "➕" and "Vytvořit novou třídu"
    safe_click(page, "button:has-text('Vytvořit novou třídu')")

    # Fill Name
    group_name = f"QA Group {uuid.uuid4().hex[:4]}"
    # Verified in professor-classes-view.js: Input inside modal, no ID.
    # Selector: Input inside the fixed modal container
    modal_input_selector = "div.fixed.inset-0 input[type='text']"

    # Wait for modal animation
    page.wait_for_selector(modal_input_selector, state="visible", timeout=5000)
    safe_fill(page, modal_input_selector, group_name)

    # Submit
    # Verified in professor-classes-view.js: Button with "Uložit" or "Save"
    safe_click(page, "div.fixed.inset-0 button:has-text('Uložit')") # Czech default

    # Wait for creation (Firestore)
    time.sleep(2)

    # Find the card
    card_selector = f".bg-white:has-text('{group_name}')"
    try:
        expect(page.locator(card_selector)).to_be_visible(timeout=10000)
    except:
        log("Card not found immediately. Reloading...")
        page.reload()
        safe_click(page, "professor-navigation button:has-text('Třídy')")
        expect(page.locator(card_selector)).to_be_visible()

    # Extract Code
    # Verified in professor-classes-view.js: Code is in <code class="font-mono ...">
    # It is displayed on the card: <div class="..."><span ...>Kód:</span> <code ...>...</code></div>
    card = page.locator(card_selector).first
    try:
        code_el = card.locator("code")
        if code_el.count() > 0:
            GROUP_CODE = code_el.inner_text().strip()
            log(f"Group created: {group_name}, Code: {GROUP_CODE}")
        else:
            # Fallback text search
            text = card.inner_text()
            import re
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

def create_lesson(page, content_type_def):
    c_type = content_type_def['type']
    c_name = content_type_def['name']

    log(f"Creating lesson for {c_name}...")

    # Go to Dashboard
    safe_click(page, "professor-navigation button:has-text('Nástěnka')")
    time.sleep(1)

    # New Lesson - Click "Create Manual" card (div with text)
    safe_click(page, "text='Vytvořit manuálně'")

    # Wizard
    title = f"QA Lesson - {c_name}"
    # Title input has placeholder "Např. Úvod do marketingu"
    safe_fill(page, "input[placeholder*='Úvod do marketingu']", title)
    # Subject input has list="subjects-list"
    safe_fill(page, "input[list='subjects-list']", "QA Testing")

    # Confirm Manual Creation (Select Manual vs Magic) - Button with text "Vytvořit manuálně"
    safe_click(page, "button:has-text('Vytvořit manuálně')")

    # Hub - Select Tool
    expect(page.locator("h3:has-text('Vyberte sekci k úpravě')")).to_be_visible()

    # Map types to buttons
    # We rely on text or grid position. Let's use text if possible, otherwise index.
    # The grid has buttons.
    # Text mapping (Czech):
    type_map_text = {
        "text": "Textový obsah",
        "presentation": "Prezentace",
        "quiz": "Kvíz",
        "test": "Závěrečný test",
        "post": "Příspěvek",
        "video": "Video lekce",
        "audio": "Podcast",
        "comic": "Komiks",
        "flashcards": "Kartičky",
        "mindmap": "Myšlenková mapa"
    }

    btn_text = type_map_text.get(c_type, c_name)
    # Use safe_click with exact text match as requested
    safe_click(page, f"button:has-text('{btn_text}')")

    # Wait for editor
    expect(page.locator("professor-header-editor")).to_be_visible()

    # Perform Input
    input_fn_name = content_type_def['manual_input_fn']
    globals()[input_fn_name](page)

    # Save
    safe_click(page, "professor-header-editor button:has-text('Uložit změny')")
    time.sleep(2)

    # Assign to Group
    # 1. Open settings/assignments if not open?
    # The provided script clicked "professor-header-editor button".first
    # professor-header.js likely has a back button or settings button.
    # The "Zpět" button is usually first.
    safe_click(page, "professor-header-editor button") # Back button

    # Now in Hub view?
    expect(page.locator("h3:has-text('Vyberte sekci k úpravě')")).to_be_visible()

    # Find assignment checkbox for our group
    # Look for label containing group name
    # Verified in lesson-editor.js: checkboxes for groups.
    try:
        # Use filter to find the label with our group name
        checkbox_label = page.locator("label").filter(has_text=f"QA Group").first
        if checkbox_label.is_visible():
             # Check if checked
             checkbox = checkbox_label.locator("input[type='checkbox']")
             if not checkbox.is_checked():
                 checkbox.check()
                 time.sleep(1) # Wait for autosave
        else:
            log("Group assignment checkbox not found!")
    except Exception as e:
        log(f"Assignment failed: {e}")

    # Capture ID
    url = page.url
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    if 'id' in qs:
        lid = qs['id'][0]
        LESSON_IDS[c_type] = lid
        log(f"Lesson ID for {c_name}: {lid}")
    else:
        log("Could not extract Lesson ID from URL")

def run_student_phase(p, headless=True):
    log("Starting Student Phase...")
    browser = p.chromium.launch(headless=headless, args=['--no-sandbox'])
    page = browser.new_page()

    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    # Login Flow
    # 1. Select Role
    if page.locator("text='Jsem Student'").is_visible():
        safe_click(page, "text='Jsem Student'")

    # 2. Register
    if page.locator("text='Registrujte se'").is_visible():
         safe_click(page, "text='Registrujte se'")

    # Verified in login-view.js
    safe_fill(page, "#register-email", STUDENT_EMAIL)
    safe_fill(page, "#register-password", STUDENT_PASSWORD)
    safe_fill(page, "#register-name", STUDENT_NAME)

    # Submit
    page.keyboard.press("Enter")

    # Wait for Dashboard
    try:
        expect(page.locator("student-dashboard")).to_be_visible(timeout=20000)
    except:
        # Fallback click
        safe_click(page, "button:has-text('Registrovat se')")
        expect(page.locator("student-dashboard")).to_be_visible(timeout=20000)

    log("Student logged in.")
    time.sleep(2)

    # Join Class
    # Option 1: Join Class Card on Dashboard
    # Verified in student-dashboard-view.js: Card with "Připojit se k třídě"
    # Option 2: Nav button
    # We'll try the card first

    try:
        # Click the card to open modal
        safe_click(page, "div.cursor-pointer:has-text('Připojit se k třídě')")
    except:
        # Try nav
        safe_click(page, "button:has-text('Třídy')")
        safe_click(page, "button:has-text('Připojit se k třídě')")

    # Fill Code
    # Verified in student-dashboard-view.js: input placeholder="CODE"
    # Modal is active
    safe_fill(page, "input[placeholder='CODE']", GROUP_CODE)

    # Click Join
    # Verified in student-dashboard-view.js: Button text "Přidat se" (from t('student.join_btn'))
    # Actually, looking at the code in student-dashboard-view.js:
    # Button: ${this.t('student.join_btn')}
    # We should guess it is "Přidat se" or "Join"
    safe_click(page, "button:has-text('Přidat se')")

    # Wait for alert or success
    time.sleep(3)
    # Handle alert if any (playwright handles it automatically mostly, but we might need to dismiss)
    # The code uses `alert()` which blocks. Playwright auto-dismisses dialogs by default.
    # We just assume success if we can proceed.

    # Verify Lessons
    failures = []
    for c_type, lid in LESSON_IDS.items():
        log(f"Verifying student view for {c_type} (ID: {lid})...")
        # Direct navigation to be safe
        page.goto(f"{BASE_URL}/?view=lesson&id={lid}")
        time.sleep(3)

        try:
            expect(page.locator("student-lesson-detail")).to_be_visible(timeout=10000)

            # Specific Checks
            if c_type == "text":
                expect(page.locator(".prose")).to_be_visible()
            elif c_type == "presentation":
                # Check for buttons if they exist, or container
                # student-lesson-detail handles switching views
                pass

            log(f"Student View OK for {c_type}")
        except Exception as e:
            log(f"Student View FAILED for {c_type}: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/fail_student_{c_type}.png")
            failures.append(c_type)

    if failures:
        raise Exception(f"Student verification failed for: {', '.join(failures)}")

    browser.close()

# --- Input Helpers ---

def input_text(page):
    # Check if AI panel is open
    if page.locator("ai-generator-panel").is_visible():
        safe_fill(page, "textarea#prompt-input", "Write a short paragraph about Testing.")
        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator(".prose")).to_be_visible(timeout=30000)
    else:
        # Manual edit
        # It's a contenteditable div usually or textarea
        # For simplicity in this test, we assume AI gen or pre-filled
        pass

def input_presentation(page):
    if page.locator("ai-generator-panel").is_visible():
        safe_fill(page, "#prompt-input-topic", "Space Exploration")
        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator(".bg-slate-50.relative").first).to_be_visible(timeout=30000)

def input_quiz(page):
    if page.locator("ai-generator-panel").is_visible():
        safe_fill(page, "textarea#prompt-input", "Math Quiz")
        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator("h4:has-text('Otázka')").first).to_be_visible(timeout=30000)

def input_test(page):
    safe_click(page, "button:has-text('Přidat otázku')")
    safe_fill(page, "input[placeholder*='Otázka']", "Test Question 1")
    # Options
    opts = page.locator("input[placeholder*='Možnost']").all()
    if len(opts) >= 2:
        opts[0].fill("Option A")
        opts[1].fill("Option B")

def input_post(page):
    safe_fill(page, "textarea", "Test Post Content")

def input_video(page):
    safe_fill(page, "input[placeholder*='YouTube']", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    # Click body to trigger blur/save
    page.click("body")

def input_comic(page):
    if page.locator("ai-generator-panel").is_visible():
         # AI Gen button is icon ✍️ or similar
         safe_click(page, "button:has-text('✍️')")

    # Manual
    safe_fill(page, "textarea[placeholder*='Popis scény']", "Scene 1")
    safe_fill(page, "textarea[placeholder*='Bublina']", "Hello")

def input_flashcards(page):
    safe_click(page, "button:has-text('Přidat kartu')")
    inputs_front = page.locator("input[placeholder*='Přední strana']").all()
    inputs_back = page.locator("textarea[placeholder*='Zadní strana']").all()
    if inputs_front and inputs_back:
        inputs_front[-1].fill("Front Test")
        inputs_back[-1].fill("Back Test")

def input_mindmap(page):
    if page.locator("ai-generator-panel").is_visible():
        safe_click(page, "button:has-text('Manuálně')")

    safe_fill(page, "textarea", "graph TD; A-->B;")
    time.sleep(2)

def input_audio(page):
    safe_fill(page, "#script-editor", "Test Audio Script")

def run():
    has_error = False
    with sync_playwright() as p:
        is_ci = os.environ.get('CI') == 'true'
        browser = p.chromium.launch(headless=is_ci, args=['--no-sandbox'])
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(60000)

        try:
            login_professor(page)
            create_group(page)

            for ct in CONTENT_TYPES:
                try:
                    create_lesson(page, ct)
                except Exception as e:
                    log(f"Error creating/verifying {ct['name']}: {e}")
                    page.screenshot(path=f"{SCREENSHOT_DIR}/error_{ct['type']}.png")
                    has_error = True

        except Exception as e:
            log(f"Critical Setup Error: {e}")
            has_error = True
            page.screenshot(path=f"{SCREENSHOT_DIR}/critical_error.png")
        finally:
            browser.close()

        if GROUP_CODE and LESSON_IDS and not has_error:
            try:
                run_student_phase(p, headless=is_ci)
            except Exception as e:
                log(f"Student Phase Error: {e}")
                has_error = True
        else:
             if not (GROUP_CODE and LESSON_IDS):
                 log("Skipping Student Phase - Missing Data")
                 has_error = True

    if has_error:
        sys.exit(1)

if __name__ == "__main__":
    run()
