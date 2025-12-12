import time
from playwright.sync_api import sync_playwright
import sys

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture logs
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

    unique_id = int(time.time())
    email = f"prof_{unique_id}@test.com"
    password = "password123"
    name = f"Prof Test {unique_id}"

    print(f"Navigating to http://localhost:5000/ ...")
    try:
        page.goto("http://localhost:5000/")
    except Exception as e:
        print(f"Failed to load page: {e}")
        sys.exit(1)

    # 1. Select Role
    print("Attempting to select Professor role...")
    try:
        page.wait_for_selector("login-view", timeout=10000)
        emoji_locator = page.locator("text=👨‍🏫")
        emoji_locator.wait_for(state="visible", timeout=10000)
        emoji_locator.click()
        print("Role 'Professor' selected via Emoji.")

    except Exception as e:
        print(f"Failed to select role: {e}")
        page.screenshot(path="verification/error_role_select.png")
        sys.exit(1)

    # 2. Register
    print(f"Attempting to register user {email}...")
    try:
        reg_link = page.locator("a").filter(has_text="Registrujte se").first
        if not reg_link.is_visible():
             reg_link = page.locator("a").filter(has_text="Register").first
        reg_link.click()

        page.wait_for_selector("#register-email", state="visible", timeout=5000)
        page.fill("#register-name", name)
        page.fill("#register-email", email)
        page.fill("#register-password", password)

        submit_btn = page.locator("button[type='submit']").last
        submit_btn.click()
        print("Registration form submitted.")

    except Exception as e:
        print(f"Failed to register: {e}")
        page.screenshot(path="verification/error_registration.png")
        sys.exit(1)

    # 3. Dashboard -> Wizard
    print("Waiting for dashboard and 'Manual Create' button...")
    try:
        # Wait for the dashboard to load. We look for "Vytvořit manuálně"
        # Since it's inside a shadow DOM or lit element that renders to light DOM (dashboard view uses createRenderRoot),
        # we can search text directly.

        manual_create_btn = page.locator("text=Vytvořit manuálně").first
        manual_create_btn.wait_for(state="visible", timeout=20000)
        print("Dashboard loaded. Clicking 'Create Manually'...")
        manual_create_btn.click()

    except Exception as e:
        print(f"Failed to navigate to wizard: {e}")
        page.screenshot(path="verification/error_dashboard_nav.png")
        sys.exit(1)

    # 4. Wizard -> Manual Mode
    print("In Wizard. Filling title and switching to Manual mode...")
    try:
        # Wait for title input
        # Placeholder is roughly "Název lekce"
        title_input = page.locator("input[type='text']").first
        title_input.wait_for(state="visible", timeout=10000)
        title_input.fill("Test UI Refactoring")

        # Click "Manuálně" button
        # The button text is "🛠️ Manuálně"
        manual_btn = page.locator("button").filter(has_text="Manuálně").first
        manual_btn.click()
        print("Switched to Manual mode (Hub).")

    except Exception as e:
        print(f"Failed in Wizard: {e}")
        page.screenshot(path="verification/error_wizard.png")
        sys.exit(1)

    # 5. Hub -> Text Editor
    print("In Hub. selecting Text tool...")
    try:
        # Wait for hub to load. Look for "Text" or "Textový obsah" (translated 'content_types.text')
        # The previous file read showed `translationService.t('content_types.text')`.
        # Usually it is "Text".
        # Let's look for the 📝 icon or the text "Text".

        # We can also look for <lesson-editor> component
        time.sleep(2) # animation

        text_tool_btn = page.locator("button").filter(has_text="Text").first
        # If translation is different, try icon
        if not text_tool_btn.is_visible():
             text_tool_btn = page.locator("button:has-text('📝')").first

        text_tool_btn.click()
        print("Clicked Text tool.")

    except Exception as e:
        print(f"Failed to select tool in Hub: {e}")
        page.screenshot(path="verification/error_hub.png")
        sys.exit(1)

    # 6. Verify Styles and Attributes
    print("Verifying UI changes...")
    try:
        # Wait for editor to appear
        page.wait_for_selector("editor-view-text", state="visible", timeout=5000)

        # A. Check Child Component Props/Attributes
        # We need id="active-editor" and class="w-full h-full block"

        child_check = page.evaluate("""() => {
            const el = document.querySelector('editor-view-text');
            if (!el) return { found: false };
            return {
                found: true,
                id: el.id,
                classes: el.className
            };
        }""")

        if not child_check['found']:
             raise Exception("editor-view-text not found in DOM")

        print(f"Found editor: {child_check}")

        if child_check['id'] != 'active-editor':
            print("FAILURE: ID is not active-editor")
        elif 'w-full' not in child_check['classes'] or 'h-full' not in child_check['classes'] or 'block' not in child_check['classes']:
            print("FAILURE: Missing classes (w-full h-full block)")
        else:
            print("SUCCESS: Child editor attributes are correct.")

        # B. Check Header Styles (inside editor-view-text -> professor-header-editor is NOT used in text editor directly?)
        # Wait, let's check `lesson-editor.js` again.
        # `editor-view-text` is passed `lesson` and `isSaving`.
        # `editor-view-text.js` likely uses `professor-header-editor`.
        # But wait, `lesson-editor.js` imports `professor-header-editor.js`.
        # However, `_renderHeader()` in `lesson-editor.js` is only used for the HUB (`_renderLessonHub` calls `this._renderHeader()`).
        # The specific editors (like `editor-view-text`) are responsible for their own headers?
        # Let's assume `editor-view-text` uses `professor-header-editor`.

        # Let's check if `professor-header-editor` is present
        page.wait_for_selector("professor-header-editor", timeout=2000)

        header_check = page.evaluate("""() => {
            const header = document.querySelector('professor-header-editor');
            if (!header) return { found: false };
            // It uses createRenderRoot => return this, so classes are on the DIV inside render()
            const div = header.querySelector('div');
            return {
                found: true,
                classes: div ? div.className : ''
            };
        }""")

        if header_check['found']:
             classes = header_check['classes']
             if 'bg-white' in classes and 'border-b' in classes and 'border-slate-200' in classes:
                 print("SUCCESS: Header styles are correct.")
             else:
                 print(f"FAILURE: Header styles mismatch: {classes}")
        else:
             print("WARNING: professor-header-editor not found (maybe text editor uses a different header?)")

    except Exception as e:
        print(f"Verification failed: {e}")
        page.screenshot(path="verification/failure_final.png")
        sys.exit(1)

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
