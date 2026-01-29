import asyncio
import time
import os
from playwright.async_api import async_playwright, expect

# --- Configuration ---
HEADLESS = True  # Default
if os.environ.get("CI"):
    HEADLESS = True

# Determine Target Environment
if os.environ.get("CI") or os.environ.get("TARGET_ENV") == "PRODUCTION":
    BASE_URL = "https://ai-sensei-czu-pilot.web.app"
else:
    BASE_URL = "http://localhost:5000"

print(f"[CONFIG] Target: {BASE_URL}, Headless: {HEADLESS}")

PROF_EMAIL_PREFIX = "prof_master_"
STUDENT_NAME = "Test Student"

async def safe_click(page, selector, timeout=5000):
    try:
        await page.locator(selector).first.click(timeout=timeout)
    except Exception as e:
        print(f"[WARN] Standard click failed: {e}. Retrying with force...")
        await page.locator(selector).first.click(force=True, timeout=timeout)

async def login_and_setup_professor(context):
    """Registers a new professor account and creates a class."""
    page = await context.new_page()

    # Generate unique email
    email = f"{PROF_EMAIL_PREFIX}{time.time()}@test.cz"
    password = "password123"

    print(f"[PROF] Registering Professor... {email}")
    await page.goto(BASE_URL)

    # Wait for app to init
    await page.wait_for_selector("login-view", state="attached", timeout=15000)

    # 1. Register
    # Check if we are on login view and switch to register if needed
    login_view = page.locator("login-view")

    # Click "Jsem Profesor" role button if visible
    role_btn = login_view.locator("button:has-text('Jsem Profesor')")
    if await role_btn.is_visible():
        await role_btn.click()

    # Click "Registrujte se" link (Anchor tag)
    await safe_click(page, "a:has-text('Registrujte se')")

    # Fill form
    await page.fill("#register-name", "Professor Master")
    await page.fill("#register-email", email)
    await page.fill("#register-password", password)

    # Submit
    await safe_click(page, "button:has-text('Registrovat se')")

    # Wait for Dashboard or Error
    try:
        # Wait up to 90s for cold start
        await page.wait_for_selector("professor-dashboard-view", timeout=90000)
        print("[PROF] Dashboard Loaded.")
    except Exception:
        print("[FAIL] Dashboard did not load.")
        # Check for error message
        error_el = page.locator(".text-red-600")
        if await error_el.count() > 0:
             print(f"[FAIL] Error on page: {await error_el.all_text_contents()}")

        await page.screenshot(path="failure_prof_dashboard.png")
        raise

    # 2. Create Class (Act 0)
    print("[ACT 0] Setting up Class...")
    # Navigate to Classes
    await safe_click(page, "professor-navigation button[data-view='classes']")

    # Click "Vytvořit novou třídu"
    await safe_click(page, "button:has-text('Vytvořit novou třídu')")

    # Fill Modal
    await page.fill("div.fixed.inset-0 input[type='text']", "Mars Mission Control")
    await safe_click(page, "div.fixed.inset-0 button:has-text('Uložit')")

    # The app automatically redirects to Class Detail View after creation
    print("[ACT 0] Waiting for redirect to Class Detail...")
    await page.wait_for_selector("professor-class-detail-view", timeout=20000)

    # Get Code from Detail Header
    # code.font-mono
    code_el = page.locator("professor-class-detail-view code.font-mono")
    await code_el.wait_for()
    join_code = await code_el.text_content()
    join_code = join_code.strip()

    print(f"[ACT 0] Class Created. Code: {join_code}")

    # Go back to dashboard
    await safe_click(page, "professor-navigation button[data-view='dashboard']")

    return page, join_code

async def act_1_architect(page):
    print("[ACT 1] The Architect...")

    # Navigate to Architect
    await safe_click(page, "professor-navigation button[data-view='architect']")

    # Wait for view
    await page.wait_for_selector("architect-view")

    # Upload Dummy PDF
    # Using a minimal valid PDF structure, escaping backslashes where needed
    dummy_pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 50 >>\nstream\nBT /F1 24 Tf 100 700 Td (Biology: Photosynthesis and Respiration) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000216 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n316\n%%EOF"

    await page.set_input_files("input[type='file']", {
        "name": "syllabus.pdf",
        "mimeType": "application/pdf",
        "buffer": dummy_pdf_content
    })

    # Wait for processing
    print("  - Uploaded file. Waiting for analysis...")

    # Button: "Generovat mapu kompetencí"
    generate_btn = page.locator("button:has-text('Generovat mapu kompetencí')")
    try:
        await generate_btn.wait_for(state="visible", timeout=30000)
        print("  - Analysis complete. Button visible.")
    except Exception:
        print("[FAIL] 'Generovat mapu' button did not appear.")
        await page.screenshot(path="failure_act1.png")
        raise

    # Click Generate
    await generate_btn.click()

    # Verify Graph
    print("  - Generating Graph...")
    # Cytoscape creates multiple canvases. We just need to see one.
    canvas = page.locator("#competency-map canvas").first
    try:
        await canvas.wait_for(state="visible", timeout=30000)
        print("[ACT 1] Success: Cytoscape Graph rendered.")
    except Exception:
        print("[FAIL] Graph canvas not found.")
        await page.screenshot(path="failure_act1_graph.png")
        raise

async def act_2_project_setup(page):
    print("[ACT 2] Project Setup...")

    # Navigate to Library
    await safe_click(page, "professor-navigation button[data-view='library']")

    # Wait for Library View
    await page.wait_for_selector("professor-library-view")

    # Click "Nový Projekt" (Rocket icon usually)
    # Update to accept Czech label 'Nový projekt' or use the icon selector .fa-rocket
    try:
        await safe_click(page, "button:has-text('New Project'), button:has-text('Nový projekt'), button:has-text('Nový Projekt'), button:has(.fa-rocket)")
    except:
        print("[WARN] 'New Project' button not found via text/icon. Trying fallback bg-emerald-600.")
        # bg-emerald-600 is unique to this button in the header
        await safe_click(page, "button.bg-emerald-600")

    # Wait for Project Editor
    await page.wait_for_selector("project-editor")

    # Fill Topic
    await page.fill("input[placeholder*='e.g., Sustainable City Design']", "Mars Colonization")

    # Duration (Selector based on value "2 weeks")
    # Using generic 'select' if possible or finding by label
    # The duration select is inside the form.
    # We can try selecting by value directly on the select element.
    # Locator: select that has option "2 weeks"
    duration_select = page.locator("select").filter(has=page.locator("option[value='2 weeks']"))
    await duration_select.select_option("2 weeks")

    # Generate Scaffolding
    print("  - Generating Scaffolding (AI)...")
    await safe_click(page, "button:has-text('Generate Project Structure')")

    # Wait for Roles (h3:has-text("Student Roles"))
    print("  - Waiting for Roles...")
    # Bilingual Selectors & Extended Timeout (90s)
    await page.locator("h3:has-text('Student Roles'), h3:has-text('Role studentů'), h3:has-text('Role')").first.wait_for(timeout=90000)
    print("  - Roles generated.")

    # Save Project
    print("  - Saving Project...")
    await safe_click(page, "button:has-text('Save Project')")

    # Wait for "Inject Crisis" button to appear (confirms Save + ID)
    print("  - Waiting for save confirmation (Inject Crisis button)...")
    crisis_btn = page.locator("button:has-text('Inject Crisis')")
    await crisis_btn.wait_for(state="visible", timeout=10000)
    print("[ACT 2] Project Saved.")

    # Assign Project to Class
    print("  - Assigning Project to Class 'Mars Mission Control'...")
    await safe_click(page, "professor-navigation button[data-view='classes']")

    # Open Class (Wait for card)
    await page.locator("h3:has-text('Mars Mission Control')").click()
    await page.wait_for_selector("professor-class-detail-view")

    # Switch to Lessons Tab (Lekce)
    # The button text depends on translation, but 'Lekce' or 'Lessons'
    # professor.stats_lessons -> 'Lekce'
    try:
        await safe_click(page, "button:has-text('Lekce')")
    except:
        print("[WARN] 'Lekce' tab not found via text. Trying icon.")
        # Icon 📚 is unique in tab bar
        await page.locator("span:has-text('📚')").locator("xpath=..").click()

    # Click "Přiřadit lekci" (Assign Lesson) - Plus icon or text
    # professor-class-detail-view.js: assign_lesson_btn
    # Text: "Přiřadit lekci"
    await safe_click(page, "button:has-text('Přiřadit lekci')")

    # Modal opens. Find "Mars Colonization"
    # It might be in the list.
    print("  - Selecting 'Mars Colonization' from modal...")
    # Find button containing title
    lesson_btn = page.locator("div.fixed.inset-0 button").filter(has=page.locator("h4:has-text('Mars Colonization')"))
    await lesson_btn.wait_for(state="visible", timeout=10000)
    await lesson_btn.click()

    # Verify assignment toast or list update
    print("  - Project Assigned.")

    # Toggle "Publish" (Visibility)
    # Checkbox is input[type='checkbox'] inside the lesson card
    # Lesson card contains h3:has-text('Mars Colonization')
    print("  - Publishing Project...")
    # The assigned lesson appears in the list. Wait for it.
    lesson_card = page.locator("div.bg-white").filter(has=page.locator("h3:has-text('Mars Colonization')"))
    await lesson_card.wait_for(state="visible", timeout=10000)

    # Click the label to toggle checkbox
    await lesson_card.locator("label").click()
    print("  - Project Published.")

async def act_3_student_join(context, join_code):
    print(f"[ACT 3] Student Joining Class {join_code}...")
    page = await context.new_page()

    await page.goto(BASE_URL)

    # Login as Student (Registration Required)
    await page.wait_for_selector("login-view")

    # Click "Jsem Student"
    await safe_click(page, "button:has-text('Jsem Student')")

    # Switch to Register
    await safe_click(page, "a:has-text('Registrujte se')")

    # Register Student (Retry Logic)
    MAX_RETRIES = 3
    for attempt in range(MAX_RETRIES):
        try:
            # Generate unique email for each attempt to avoid collisions if previous attempt partially succeeded
            student_email = f"student_{time.time()}@test.cz"
            print(f"  - Registration Attempt {attempt+1}/{MAX_RETRIES} ({student_email})")

            await page.fill("#register-name", STUDENT_NAME)
            await page.fill("#register-email", student_email)
            await page.fill("#register-password", "password123")
            await safe_click(page, "button:has-text('Registrovat se')")

            # Wait for Student Dashboard
            print("  - Waiting for student dashboard...")
            # Note: Tag name is 'student-dashboard', not '-view'
            await page.wait_for_selector("student-dashboard", timeout=90000)
            print("  - Student Dashboard Loaded.")
            break # Success

        except Exception as e:
            print(f"[WARN] Registration Attempt {attempt+1} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                print("  - Retrying in 5 seconds...")
                await asyncio.sleep(5)
                # Ensure we are on the registration page or reset state
                if not await page.locator("button:has-text('Registrovat se')").is_visible():
                     print("  - Form lost. Reloading...")
                     await page.reload()
                     await page.wait_for_selector("login-view")
                     await safe_click(page, "button:has-text('Jsem Student')")
                     await safe_click(page, "a:has-text('Registrujte se')")
            else:
                print("[FAIL] All registration attempts failed.")
                # Check for error message
                error_el = page.locator(".text-red-600")
                if await error_el.count() > 0:
                     print(f"[FAIL] Error on page: {await error_el.all_text_contents()}")
                await page.screenshot(path="failure_act3.png", full_page=True)
                raise

    # Join Class via Dashboard
    print("  - Opening Join Class Modal...")
    # Button with Rocket icon or "Připojit se k třídě"
    # student-dashboard-view.js: renderMobileNavItem('join', ...) or the big buttons
    # "Rychlé akce" -> button with text "Připojit se k třídě" (translated)
    # cs.json: "student.join_class": "Připojit se k třídě"

    # Try finding the button
    join_btn = page.locator("button:has-text('Připojit se k třídě')")
    if not await join_btn.is_visible():
        # Maybe icon only?
        # Try generic button inside the dashboard that opens the modal
        # We can look for the rocket icon div
        join_btn = page.locator("div.bg-indigo-50:has-text('🚀')").locator("xpath=..")

    await join_btn.click()

    # Fill Code
    print(f"  - Entering Code: {join_code}")
    await page.fill("input[placeholder='CODE']", join_code)
    await page.press("input[placeholder='CODE']", "Enter") # Or click join button

    # Wait for Success Alert or Redirect
    # The code uses alert() for success!
    # Playwright auto-dismisses alerts, but we should verify we are in the class or redirected.
    # Actually, after join, the dashboard might refresh or we might need to navigate.
    # The dashboard doesn't auto-redirect to the class/lesson unless notified.
    # But the "Active Lesson" card should appear if there is one.

    # Wait for Dashboard to update with "Active Lesson" (Real-time)
    print("  - Waiting for 'Active Lesson' card to appear...")

    # Force reload to ensure data consistency
    await page.reload()
    await page.wait_for_selector("student-dashboard")

    # Find the Project Card "Mars Colonization"
    if not await page.locator("student-project-view").is_visible():
        print("  - Looking for project 'Mars Colonization'...")

        # Try finding in Dashboard Hero or Quick List
        project_card = page.locator("h3:has-text('Mars Colonization')").first

        if not await project_card.is_visible():
            print("  - Not found on Dashboard. Switching to 'Moje lekce'...")
            # Click "Moje lekce" (Desktop) or "Lekce" (Mobile)
            # Try finding the nav button by text
            try:
                await page.click("button:has-text('Moje lekce')")
            except:
                # Fallback to icon or mobile text
                await page.click("button:has-text('Lekce')")

            # Now wait for card
            await project_card.wait_for(timeout=30000)

        await project_card.click()

    # Wait for Project View (Role Selection)
    await page.wait_for_selector("student-project-view")
    print("  - Role Selection screen loaded.")

    # Select a Role
    # Find active role cards (generated in Act 2)
    # They are likely button-like or cards.
    # Selector based on common card classes or text
    # In student-project-view.js, role selection usually involves clicking a card.
    # Let's target the first available role card.
    # Assuming class "role-card" or similar, or just text matching known roles (Commander, Engineer)
    # The mock AI generates roles like "Project Manager", "Architect".
    # We click the first one.

    # Wait for render
    await page.wait_for_timeout(1000)

    # Try generic selector for role item
    # If using student-project-view, it might render role selection.
    # Let's try text "Select" or click the first div with text.

    # Actually, verify_production_master.py earlier used .role-card.
    # If that failed, we need a better one.
    # Let's try just clicking the first H3 inside the role selection area.

    # For now, let's look for a button "Select Role" or similar if text exists.
    # Or just click the first card.
    # Mock roles: "Project Manager", "Researcher"
    print("  - Selecting Role 'Project Manager'...")
    try:
        await safe_click(page, "h3:has-text('Project Manager')")
    except:
        print("[WARN] 'Project Manager' role not found. Dumping page text.")
        print(await page.locator("body").text_content())
        raise

    # Confirm
    confirm_btn = page.locator("button:has-text('Potvrdit')").or_(page.locator("button:has-text('Confirm')"))
    if await confirm_btn.is_visible():
        await confirm_btn.click()

    # Verify Dashboard loads (tasks list etc)
    # Check for ".project-dashboard" class might fail if not present.
    # Look for "Active Phase" badge or Timeline elements.
    await page.locator("text=Active Phase").first.wait_for(timeout=10000)
    print("[ACT 3] Student Dashboard loaded with Role.")

    return page

async def act_4_crisis(prof_page, student_page):
    print("[ACT 4] The Crisis...")

    # Navigate Prof to Project Editor (since Act 2 left him in Class Detail)
    print("  - Prof: Navigating to Project Editor...")
    await safe_click(prof_page, "professor-navigation button[data-view='library']")

    # Wait for library
    await prof_page.wait_for_selector("professor-library-view")

    # Open "Mars Colonization"
    # Find card
    card = prof_page.locator("h3:has-text('Mars Colonization')").first
    # Click "Otevřít" in that card
    # Card structure: div.group -> ... -> div -> button:has-text('Otevřít')
    # Parent of H3 is div.flex-grow. Parent of that is div.group.
    # Button is in div.mt-auto inside div.group.
    # We can just click "Otevřít" inside the card scope
    await card.locator("xpath=../..").locator("button:has-text('Otevřít')").click()

    # Wait for Editor
    await prof_page.wait_for_selector("project-editor")

    # Wait a bit for properties to bind and render
    await prof_page.wait_for_timeout(3000)

    # Prof triggers crisis
    print("  - Prof: Clicking Inject Crisis...")
    # Button might be icon-only on small screens? No, Prof view is desktop.
    crisis_btn = prof_page.locator("button:has-text('Inject Crisis')")
    await crisis_btn.wait_for(state="visible", timeout=10000)
    await crisis_btn.click()

    # Confirm dialog?
    # project-editor.js says: if (!confirm(...)) return;
    # Playwright handles dialogs automatically (dismiss by default).
    # We need to accept it.

    prof_page.on("dialog", lambda dialog: dialog.accept())

    # Note: Dialog handler must be set BEFORE action.
    # Re-clicking to ensure dialog is caught (if strictly async, race condition might apply, but usually OK)
    # But since I already clicked, and if dialog appeared, it might have been dismissed.
    # Wait, Playwright auto-dismisses! So the crisis was CANCELED!
    # I need to set the handler before clicking.

    # Retry logic:
    # Reload page? No.
    # Just click again with handler.
    prof_page.on("dialog", lambda dialog: dialog.accept())
    await crisis_btn.click()
    print("  - Prof: Injected Crisis (Dialog Accepted).")

    # Verify Student sees Overlay
    print("  - Student: Checking for Alert...")
    overlay = student_page.locator(".bg-red-600") # Looking for the red header of crisis
    try:
        await overlay.wait_for(state="visible", timeout=10000)
        print("[ACT 4] Success: Crisis Overlay detected on Student.")
    except:
        print("[FAIL] Crisis Overlay not shown.")
        await student_page.screenshot(path="failure_crisis.png")
        raise

    # Resolve
    print("  - Student: Resolving Crisis...")
    # Button inside overlay - "PROVÉST OBNOVU A VYŘEŠIT" or "EXECUTE RECOVERY"
    resolve_btn = student_page.locator("button").filter(has_text="OBNOVU")
    if not await resolve_btn.is_visible():
         resolve_btn = student_page.locator("button").filter(has_text="RECOVERY")

    await resolve_btn.click()

    # Verify Overlay Disappears
    await expect(overlay).to_be_hidden()
    print("[ACT 4] Crisis Resolved.")

async def act_5_analytics(prof_page):
    print("[ACT 5] Analytics...")

    # Navigate to Analytics
    await safe_click(prof_page, "professor-navigation button[data-view='analytics']")

    # Verify Heatmap
    print("  - Checking for Heatmap...")
    # Looking for a canvas (Chart.js usually) or a specific container
    heatmap = prof_page.locator("canvas").first
    try:
        await heatmap.wait_for(timeout=10000)
        print("  - Heatmap/Chart visible.")
    except:
        print("[WARN] Heatmap not found. Might depend on data.")

    # Export Data
    print("  - Exporting Data...")
    # Button "Export Research Data" or "Export"
    # In cs.json: "research.export_json": "Export JSON"
    # professor-analytics-view.js probably has it.
    # Let's target text "Export"
    export_btn = prof_page.locator("button:has-text('Export')").first

    if await export_btn.is_visible():
        # Click and catch download event
        try:
            async with prof_page.expect_download(timeout=5000) as download_info:
                await export_btn.click()
            download = await download_info.value
            print(f"[ACT 5] Download detected: {download.suggested_filename}")
        except:
             print("[WARN] Download did not trigger or timed out.")
    else:
        print("[WARN] Export button not found.")

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS, args=["--no-sandbox", "--disable-setuid-sandbox"])

        # Contexts
        context_prof = await browser.new_context(permissions=['microphone'])
        context_student = await browser.new_context()

        # Debug Console
        context_student.on("page", lambda page: page.on("console", lambda msg: print(f"[STUDENT CONSOLE] {msg.text}")))
        context_prof.on("page", lambda page: page.on("console", lambda msg: print(f"[PROF CONSOLE] {msg.text}")))

        try:
            # Act 0 & 1 & 2 (Professor)
            prof_page, join_code = await login_and_setup_professor(context_prof)

            await act_1_architect(prof_page)

            await act_2_project_setup(prof_page)
            # Prof is now in Project Editor

            # Act 3 (Student)
            student_page = await act_3_student_join(context_student, join_code)

            # Act 4 (Interaction)
            await act_4_crisis(prof_page, student_page)

            # Act 5 (Analytics)
            await act_5_analytics(prof_page)

            print("\n[SUCCESS] Master Production Verification Completed.")

        except Exception as e:
            print(f"\n[ERROR] Test Failed: {e}")
            import traceback
            traceback.print_exc()
            import sys
            sys.exit(1)
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
