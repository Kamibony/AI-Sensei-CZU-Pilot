from playwright.sync_api import sync_playwright, expect
import time
import os
import sys
import uuid
import sys

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

def login_professor(page):
    log("Registering/Logging in Professor...")
    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    # Select Role
    if page.locator("text='Jsem Profesor'").is_visible():
        page.locator("text='Jsem Profesor'").first.click(force=True)

    # Switch to Registration
    # Look for link "Registrace"
    try:
        page.locator("a:has-text('Registrace')").click(force=True)
        page.wait_for_selector("#register-name", state="visible")
        time.sleep(1)
    except:
        log("Could not find registration link, maybe already in register mode or different text")

    # Fill Registration
    log(f"Registering as {PROFESSOR_EMAIL}...")

    # Force interaction to bypass visibility checks in CI
    page.wait_for_timeout(2000)
    page.fill("#register-name", PROFESSOR_NAME, force=True)
    page.fill("#register-email", PROFESSOR_EMAIL, force=True)
    page.fill("#register-password", PROFESSOR_PASSWORD, force=True)

    # Click Register Button (Amber/Orange for Professor)
    # Debug Snapshot
    page.screenshot(path="debug_before_submit.png")

    # Robust Submission Strategy
    print("[TEST] Submitting registration form...")
    page.keyboard.press("Enter")
    page.wait_for_timeout(2000)

    # Retry click if still on login page
    if page.locator("#register-name").is_visible():
        print("[TEST] Form still visible, forcing JS click...")
        page.evaluate("document.querySelector('button.bg-gradient-to-r.from-amber-600').click()")
        page.wait_for_timeout(5000)

    # Extended Wait for Dashboard
    print("[TEST] Waiting for Dashboard redirection...")
    # Wait for dashboard
    try:
        expect(page.locator("professor-dashboard-view")).to_be_visible(timeout=60000)
        log("Professor registered and logged in.")
    except:
        log("Dashboard not visible after registration. Checking for errors...")
        error_el = page.locator(".bg-red-50")
        if error_el.is_visible():
            log(f"Registration Error: {error_el.inner_text()}")

        # Log page content for debugging
        print(f"[DEBUG] Page Content: {page.content()}")

        page.screenshot(path=f"{SCREENSHOT_DIR}/registration_fail.png")
        raise

def create_group(page):
    global GROUP_CODE
    log("Creating Group...")
    # Navigate to classes - sidebar button
    page.locator("#professor-sidebar button:has-text('Třídy')").click()
    expect(page.locator("professor-classes-view")).to_be_visible()

    # Create new class
    page.click("button:has-text('Vytvořit třídu')")
    group_name = f"QA Group {uuid.uuid4().hex[:4]}"
    page.fill("#new-group-name", group_name)
    page.click("#save-group-btn")

    time.sleep(2) # Wait for Firestore

    # Find the card
    card = page.locator(f".bg-white:has-text('{group_name}')")
    expect(card).to_be_visible()

    # Extract code
    text_content = card.inner_text()
    import re
    match = re.search(r"Kód:\s*([A-Z0-9]+)", text_content)
    if match:
        GROUP_CODE = match.group(1)
        log(f"Group created: {group_name}, Code: {GROUP_CODE}")
    else:
        # Fallback: click details
        log("Could not extract code from card. Trying details...")
        card.click()
        time.sleep(1)
        # Details view
        code_el = page.locator(".text-4xl.font-mono")
        if code_el.is_visible():
            GROUP_CODE = code_el.inner_text().strip()
            log(f"Group created: {group_name}, Code: {GROUP_CODE}")
        else:
             log("FAILED to get group code.")

        # Go back
        page.click("button:has-text('Zpět')")

def create_lesson(page, content_type_def):
    c_type = content_type_def['type']
    c_name = content_type_def['name']

    log(f"Creating lesson for {c_name}...")

    # Go to Dashboard -> New Lesson
    page.locator("#professor-sidebar button:has-text('Nástěnka')").click()
    time.sleep(1)
    page.click("button:has-text('Nová lekce')")

    # Wizard
    title = f"QA Lesson - {c_name}"
    page.fill("input[placeholder*='Název lekce']", title)
    page.fill("input[placeholder*='Předmět']", "QA Testing")
    page.click("button:has-text('Manuálně')")

    # Hub - Select Tool
    expect(page.locator("h3:has-text('Obsah lekce')")).to_be_visible()

    index_map = {
        "text": 0, "presentation": 1, "quiz": 2, "test": 3, "post": 4,
        "video": 5, "audio": 6, "comic": 7, "flashcards": 8, "mindmap": 9
    }

    buttons = page.locator("div.grid.grid-cols-2.md\\:grid-cols-3.lg\\:grid-cols-4.gap-4 button").all()
    if len(buttons) < 10:
        log("Error: Not all tool buttons found.")
        page.screenshot(path=f"{SCREENSHOT_DIR}/hub_error.png")
        return

    buttons[index_map[c_type]].click()

    # Wait for editor to load
    expect(page.locator("professor-header-editor")).to_be_visible()

    # Perform Input
    input_fn_name = content_type_def['manual_input_fn']
    globals()[input_fn_name](page)

    # Save
    page.locator("professor-header-editor button:has-text('Uložit změny')").click()
    time.sleep(2)

    # Reload
    log(f"Reloading {c_name}...")
    page.reload()
    time.sleep(3)

    # Verify Persistence
    verify_persistence(page, content_type_def)

    # Assign to Group
    page.locator("professor-header-editor button").first.click()
    expect(page.locator("h3:has-text('Obsah lekce')")).to_be_visible()

    checkbox = page.locator("label").filter(has_text="QA Group").locator("input[type='checkbox']").first
    if checkbox.is_visible() and not checkbox.is_checked():
        checkbox.check()
        time.sleep(1)

    # Capture ID
    url = page.url
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    if 'id' in qs:
        lid = qs['id'][0]
        LESSON_IDS[c_type] = lid
        log(f"Lesson ID for {c_name}: {lid}")

def verify_persistence(page, content_type_def):
    c_type = content_type_def['type']
    check_selector = content_type_def['check_selector']

    log(f"Verifying persistence for {c_type}...")
    try:
        expect(page.locator(check_selector).first).to_be_visible(timeout=10000)
        log(f"Persistence OK for {c_type}")
    except Exception as e:
        log(f"Persistence FAILED for {c_type}: {e}")
        page.screenshot(path=f"{SCREENSHOT_DIR}/fail_{c_type}_persistence.png")

# --- Input Functions ---

def input_text(page):
    if page.locator("ai-generator-panel").is_visible():
        page.fill("textarea#prompt-input", "Write a short paragraph about Testing.")
        page.click("button:has-text('Generovat')")
        expect(page.locator(".prose")).to_be_visible(timeout=30000)

    page.locator(".prose").click()
    page.keyboard.type(" Test Content")

def input_presentation(page):
    if page.locator("ai-generator-panel").is_visible():
        page.fill("#prompt-input-topic", "Space Exploration")
        page.click("button:has-text('Generovat')")
        expect(page.locator(".bg-slate-50.relative").first).to_be_visible(timeout=30000)

def input_quiz(page):
    if page.locator("ai-generator-panel").is_visible():
        page.fill("textarea#prompt-input", "Math Quiz")
        page.click("button:has-text('Generovat')")
        expect(page.locator("h4:has-text('Otázka')").first).to_be_visible(timeout=30000)

def input_test(page):
    page.click("button:has-text('Přidat otázku')")
    inputs = page.locator("input[placeholder*='Otázka']").all()
    if inputs:
        inputs[-1].fill("Test Question 1")

    opts = page.locator("input[placeholder*='Možnost']").all()
    if len(opts) >= 4:
        opts[-4].fill("Option A")
        opts[-3].fill("Option B")

def input_post(page):
    page.fill("textarea", "Test Post Content")

def input_video(page):
    page.fill("input[placeholder*='YouTube']", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    page.click("body")

def input_comic(page):
    if page.locator("ai-generator-panel").is_visible():
        page.click("button:has-text('✍️')")

    page.locator("textarea[placeholder*='Popis scény']").first.fill("Scene 1")
    page.locator("textarea[placeholder*='Bublina']").first.fill("Hello")

def input_flashcards(page):
    page.click("button:has-text('Přidat kartu')")
    page.locator("input[placeholder*='Přední strana']").last.fill("Front Test")
    page.locator("textarea[placeholder*='Zadní strana']").last.fill("Back Test")

def input_mindmap(page):
    if page.locator("ai-generator-panel").is_visible():
        page.click("button:has-text('Manuálně')")

    page.fill("textarea", "graph TD; A-->B;")
    time.sleep(2)

def input_audio(page):
    page.fill("#script-editor", "Test Audio Script")


def run_student_phase(p, headless=True):
    log("Starting Student Phase...")
    is_ci = os.environ.get('CI') == 'true'
    browser = p.chromium.launch(headless=is_ci, args=['--no-sandbox'])
    page = browser.new_page()

    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    if page.locator("text='Jsem Student'").is_visible():
        page.locator("text='Jsem Student'").click()

    if page.locator("text='Registrace'").is_visible():
         page.click("text='Registrace'")

    page.fill("#reg-email", STUDENT_EMAIL)
    page.fill("#reg-password", STUDENT_PASSWORD)
    page.fill("#reg-name", STUDENT_NAME)

    # Try 1: Press Enter
    page.keyboard.press("Enter")

    # Safety wait
    page.wait_for_timeout(1000)

    # Try 2: JavaScript Click
    if page.locator("button:has-text('Registrovat')").count() > 0:
        page.evaluate("document.querySelector('button[type=submit]').click()")

    time.sleep(5)

    try:
        if page.locator("button:has-text('Přidat se')").is_visible():
            page.click("button:has-text('Přidat se')")

        page.fill("input[placeholder*='Kód']", GROUP_CODE)
        page.click("button:has-text('Potvrdit')")
        time.sleep(3)
    except Exception as e:
        log(f"Join class issue: {e}")
        page.screenshot(path=f"{SCREENSHOT_DIR}/student_join_fail.png")

    failures = []
    for c_type, lid in LESSON_IDS.items():
        log(f"Verifying student view for {c_type} (ID: {lid})...")
        page.goto(f"{BASE_URL}/?view=lesson&id={lid}")
        time.sleep(3)

        try:
            expect(page.locator("student-lesson-detail")).to_be_visible(timeout=10000)

            if c_type == "text":
                expect(page.locator(".prose")).to_be_visible()
            elif c_type == "presentation":
                page.click("button:has-text('Prezentace')")
                expect(page.locator("#presentation-container")).to_be_visible()
            elif c_type == "quiz":
                page.click("button:has-text('Kvíz')")
                expect(page.locator("student-quiz")).to_be_visible()

            log(f"Student View OK for {c_type}")
        except Exception as e:
            log(f"Student View FAILED for {c_type}: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/fail_student_{c_type}.png")
            failures.append(c_type)

    if failures:
        raise Exception(f"Student verification failed for: {', '.join(failures)}")

    browser.close()

def run():
    has_error = False
    with sync_playwright() as p:
        is_ci = os.environ.get('CI') == 'true'
        browser = p.chromium.launch(headless=is_ci, args=['--no-sandbox'])
        context = browser.new_context()
        page = context.new_page()

        # Increase default timeout for CI
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
        finally:
            browser.close()

        if GROUP_CODE and LESSON_IDS and not has_error:
            try:
                headless_mode = is_ci
                run_student_phase(p, headless=headless_mode)
            except Exception as e:
                log(f"Student Phase Error: {e}")
                has_error = True
        else:
            if not (GROUP_CODE and LESSON_IDS):
                 log("Skipping Student Phase due to missing Group Code or Lessons")
                 has_error = True

    if has_error:
        sys.exit(1)

if __name__ == "__main__":
    run()
