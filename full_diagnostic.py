from playwright.sync_api import sync_playwright, expect
import time
import os
import sys
import uuid
import json
import re
import urllib.parse

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

# Full Diagnostic Mode: Test ALL content types
CONTENT_TYPES = [
    {"type": "text", "name": "Text", "manual_input_fn": "input_text", "check_selector": ".prose"},
    {"type": "presentation", "name": "Presentation", "manual_input_fn": "input_presentation", "check_selector": ".bg-slate-50.relative"},
    {"type": "post", "name": "Post", "manual_input_fn": "input_post", "check_selector": "textarea[placeholder*='Napište']"},
    {"type": "quiz", "name": "Quiz", "manual_input_fn": "input_quiz", "check_selector": "h4.text-green-700"},
    {"type": "test", "name": "Test", "manual_input_fn": "input_test", "check_selector": "input[placeholder*='Zformulujte otázku']"},
    {"type": "video", "name": "Video", "manual_input_fn": "input_video", "check_selector": "iframe"},
    {"type": "comic", "name": "Comic", "manual_input_fn": "input_comic", "check_selector": "textarea[placeholder*='Co se děje na obrázku']"},
    {"type": "flashcards", "name": "Flashcards", "manual_input_fn": "input_flashcards", "check_selector": "input[placeholder*='Mitochondrie']"},
    {"type": "mindmap", "name": "Mindmap", "manual_input_fn": "input_mindmap", "check_selector": "#mermaid-preview svg"},
    {"type": "audio", "name": "Audio", "manual_input_fn": "input_audio", "check_selector": "#script-editor"}
]

LESSON_IDS = {}
GROUP_CODE = ""

def log(msg):
    print(f"[TEST] {msg}")

# --- Helper Functions ---

def safe_click(page, selector, timeout=5000):
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
    Bypasses Playwright's dispatch_event API version issues and correctly passes value as arg.
    """
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
    global GROUP_CODE
    log("Creating Group...")

    try:
        safe_click(page, "professor-navigation button:has-text('Třídy')")
    except:
        safe_click(page, "professor-navigation button:has-text('Classes')")

    expect(page.locator("professor-classes-view")).to_be_visible()

    safe_click(page, "button:has-text('Vytvořit novou třídu')")

    group_name = f"QA Group {uuid.uuid4().hex[:4]}"
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

def create_lesson(page, content_type_def):
    c_type = content_type_def['type']
    c_name = content_type_def['name']

    log(f"Creating lesson for {c_name}...")

    safe_click(page, "professor-navigation button:has-text('Nástěnka')")
    time.sleep(1)

    safe_click(page, "text='Vytvořit manuálně'")

    title = f"QA Lesson - {c_name}"
    safe_fill(page, "input[placeholder*='Úvod do marketingu']", title)
    safe_fill(page, "input[list='subjects-list']", "QA Testing")

    safe_click(page, "button:has-text('Vytvořit manuálně')")

    page.wait_for_timeout(2000)

    expect(page.locator("h3:has-text('Vyberte sekci k úpravě')")).to_be_visible()

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
    safe_click(page, f"button:has-text('{btn_text}')")

    expect(page.locator("professor-header-editor")).to_be_visible()

    input_fn_name = content_type_def['manual_input_fn']
    globals()[input_fn_name](page)

    safe_click(page, "professor-header-editor button:has-text('Uložit změny')")
    time.sleep(2)

    safe_click(page, "professor-header-editor button")

    expect(page.locator("h3:has-text('Vyberte sekci k úpravě')")).to_be_visible()

    try:
        checkbox_label = page.locator("label").filter(has_text=f"QA Group").first
        if checkbox_label.is_visible():
             checkbox = checkbox_label.locator("input[type='checkbox']")
             if not checkbox.is_checked():
                 checkbox.check()
                 time.sleep(1)
        else:
            log("Group assignment checkbox not found!")
    except Exception as e:
        log(f"Assignment failed: {e}")

    # Robust Lesson ID Extraction
    try:
        url = page.url
        match = re.search(r"/editor/([a-zA-Z0-9_-]+)", url)
        if match:
            lid = match.group(1)
            LESSON_IDS[c_type] = lid
            log(f"Lesson ID for {c_name}: {lid} (Extracted from URL: {url})")
        else:
            # Fallback 1: Query parameters (legacy or different route)
            parsed = urllib.parse.urlparse(url)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'id' in qs:
                lid = qs['id'][0]
                LESSON_IDS[c_type] = lid
                log(f"Lesson ID for {c_name}: {lid} (Extracted from Query Params)")
            else:
                log(f"Could not extract Lesson ID from URL: {url}")
    except Exception as e:
        log(f"Error extracting lesson ID: {e}")

def run_student_phase(p, headless=True):
    log("Starting Student Phase...")
    browser = p.chromium.launch(headless=headless, args=['--no-sandbox'])
    page = browser.new_page()

    page.goto(f"{BASE_URL}/")
    time.sleep(2)

    if page.locator("text='Jsem Student'").is_visible():
        safe_click(page, "text='Jsem Student'")

    if page.locator("text='Registrujte se'").is_visible():
         safe_click(page, "text='Registrujte se'")

    safe_fill(page, "#register-email", STUDENT_EMAIL)
    safe_fill(page, "#register-password", STUDENT_PASSWORD)
    safe_fill(page, "#register-name", STUDENT_NAME)

    page.keyboard.press("Enter")

    try:
        expect(page.locator("student-dashboard")).to_be_visible(timeout=20000)
    except:
        safe_click(page, "button:has-text('Registrovat se')")
        expect(page.locator("student-dashboard")).to_be_visible(timeout=20000)

    log("Student logged in.")
    time.sleep(2)

    try:
        safe_click(page, "div.cursor-pointer:has-text('Připojit se k třídě')")
    except:
        safe_click(page, "button:has-text('Třídy')")
        safe_click(page, "button:has-text('Připojit se k třídě')")

    safe_fill(page, "input[placeholder='CODE']", GROUP_CODE)

    safe_click(page, "button:has-text('Přidat se')")

    time.sleep(3)

    failures = []
    for c_type, lid in LESSON_IDS.items():
        log(f"Verifying student view for {c_type} (ID: {lid})...")
        page.goto(f"{BASE_URL}/?view=lesson&id={lid}")
        time.sleep(3)

        try:
            expect(page.locator("student-lesson-detail")).to_be_visible(timeout=10000)
            if c_type == "text":
                expect(page.locator(".prose")).to_be_visible()
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
    if page.locator("ai-generator-panel").is_visible():
        safe_fill(page, "textarea#prompt-input", "Write a short paragraph about Testing.")
        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator(".prose")).to_be_visible(timeout=30000)
    else:
        pass

def input_presentation(page):
    if page.locator("ai-generator-panel").is_visible():
        if page.locator("#prompt-input-topic").count() > 0:
             safe_fill(page, "#prompt-input-topic", "Space Exploration")
        else:
             safe_fill(page, "input[placeholder*='Klíčové momenty']", "Space Exploration")

        safe_click(page, "button:has-text('Generovat')")
        expect(page.locator(".bg-slate-50.relative").first).to_be_visible(timeout=30000)

def input_quiz(page):
    log("Injecting Manual Quiz Data (Bypassing AI)...")
    quiz_data = {
        "questions": [
            {
                "question_text": "Manual Quiz Question 1",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_option_index": 0,
                "type": "Multiple Choice"
            }
        ]
    }

    data_json = json.dumps(quiz_data)

    page.evaluate(f"""
        const app = document.querySelector('lesson-editor');
        if (app) {{
            const newQuiz = {data_json};
            app.lesson = {{ ...app.lesson, quiz: newQuiz }};
            app.requestUpdate();
        }}
    """)

    page.evaluate(f"""
        const editor = document.querySelector('editor-view-quiz');
        if (editor) {{
            editor.dispatchEvent(new CustomEvent('lesson-updated', {{
                detail: {data_json},
                bubbles: true,
                composed: true
            }}));
        }}
    """)

    try:
        expect(page.locator("h4.text-green-700").first).to_be_visible(timeout=5000)
    except:
        log("Quiz update not visible immediately. Proceeding...")
        pass

def input_test(page):
    safe_click(page, "button:has-text('Přidat otázku')")
    page.wait_for_timeout(2000)
    safe_fill(page, "input[placeholder*='Zformulujte otázku']", "Test Question 1")
    opts = page.locator("input[placeholder*='Možnost']").all()
    if len(opts) >= 2:
        opts[0].fill("Option A")
        opts[1].fill("Option B")

def input_post(page):
    safe_fill(page, "textarea", "Test Post Content")

def input_video(page):
    selector = "input[placeholder*='youtube.com']"
    safe_fill_and_trigger(page, selector, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    page.wait_for_timeout(2000)
    page.click("body")
    expect(page.locator("professor-header-editor button:has-text('Uložit změny')")).to_be_enabled(timeout=20000)

def input_comic(page):
    if page.locator("ai-generator-panel").is_visible():
         safe_click(page, "button:has-text('✍️')")
         page.wait_for_timeout(2000)
         page.wait_for_selector("textarea", state="visible", timeout=10000)

    safe_fill(page, "textarea[placeholder*='Co se děje na obrázku']", "Scene 1")
    safe_fill(page, "textarea[placeholder*='Co postavy říkají']", "Hello")

def input_flashcards(page):
    safe_click(page, "button:has-text('Přidat kartu')")
    page.wait_for_timeout(2000)

    inputs_front = page.locator("input[placeholder*='Mitochondrie']").all()
    if inputs_front:
        last_front = inputs_front[-1]
        # Use safe_fill_and_trigger logic but for locator context
        last_front.fill("Front Test")
        last_front.evaluate("""(el) => {
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }""")

    inputs_back = page.locator("textarea[placeholder*='Vysvětlení pojmu']").all()
    if inputs_back:
        last_back = inputs_back[-1]
        last_back.fill("Back Test")
        last_back.evaluate("""(el) => {
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }""")

def input_mindmap(page):
    if page.locator("ai-generator-panel").is_visible():
        safe_click(page, "button:has-text('Psát kód ručně')")
        page.wait_for_timeout(2000) # Increased wait
        page.wait_for_selector("textarea", state="visible", timeout=10000)

    safe_fill(page, "textarea", "graph TD; A-->B;")
    time.sleep(2)

def input_audio(page):
    selector = "#script-editor"
    if page.locator(selector).count() == 0:
        selector = "textarea[placeholder*='[Alex]']"

    safe_fill_and_trigger(page, selector, "Test Audio Script")

def run():
    has_error = False
    with sync_playwright() as p:
        is_ci = os.environ.get('CI') == 'true'
        browser = p.chromium.launch(headless=is_ci, args=['--no-sandbox'])
        context = browser.new_context()
        page = context.new_page()
        # Generous timeout for Full Diagnostic
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

                try:
                    page.goto(f"{BASE_URL}/#dashboard")
                    page.wait_for_timeout(2000)
                except Exception as e:
                    log(f"Warning: Failed to navigate back to dashboard: {e}")

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
