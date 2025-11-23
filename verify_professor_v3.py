from playwright.sync_api import sync_playwright
import time

def verify_professor_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:5002/")

        # 1. Login
        print("Logging in...")
        page.wait_for_selector("button#login-professor", timeout=10000)
        page.click("button#login-professor") # Go to professor login

        page.fill("#login-email", "profesor@profesor.cz")
        page.fill("#login-password", "password123")
        page.click("#login-form-element button[type='submit']")

        # 2. Verify Dashboard
        print("Verifying Dashboard...")
        # Wait for dashboard to load (header)
        page.wait_for_selector("h1:has-text('Dobré ráno')", timeout=20000)

        # Check Sidebar Width (w-64 is approx 256px)
        sidebar = page.locator("#main-nav")
        box = sidebar.bounding_box()
        if box['width'] > 250:
            print("SUCCESS: Sidebar width is expanded (~256px).")
        else:
            print(f"FAILURE: Sidebar width is {box['width']}px")

        # Check Sidebar Groups
        content = page.content()
        if "Organizace" in content and "Tvůrčí Studio" in content:
             print("SUCCESS: Sidebar groups found.")
        else:
             print("FAILURE: Sidebar groups missing.")

        # Check Dashboard Pipeline (removed classes list, added workflow)
        # We look for the workflow card text
        if "PDF Vstup" in content and "AI Proces" in content:
            print("SUCCESS: Lesson Workflow pipeline found on Dashboard.")
        else:
            print("FAILURE: Lesson Workflow pipeline NOT found.")

        if "classes-section" not in content and "Seznam Tříd" not in content: # Assuming 'Seznam Tříd' was the header
             print("SUCCESS: Classes section removed from Dashboard.")

        # 3. Navigate to Lesson Editor via Pipeline Card
        print("Navigating to Lesson Editor...")
        # Click the workflow card (it should dispatch event)
        # Assuming the card has some text identifying it, or we look for the element containing the pipeline
        page.click("text=PDF Vstup")

        # Wait for Editor
        page.wait_for_selector("#lesson-editor-view", timeout=10000)
        print("SUCCESS: Navigated to Lesson Editor.")

        # 4. Verify Step 1
        print("Verifying Step 1 UI...")
        step1 = page.locator("#step-1")
        if step1.is_visible():
            # Check for Dropzone
            if page.locator("#upload-dropzone").is_visible():
                print("SUCCESS: Dropzone found.")
            else:
                print("FAILURE: Dropzone missing.")

            # Check buttons
            if page.locator("button:has-text('Magicky Vygenerovat Vše')").is_visible():
                print("SUCCESS: Magic Button found.")
            else:
                print("FAILURE: Magic Button missing.")
        else:
            print("FAILURE: Step 1 not visible.")

        # 5. Verify Step 2 Tabs (Click Manual Creation to go to step 2)
        print("Navigating to Step 2...")
        page.click("button:has-text('Manuální Tvorba')")

        # Check tabs
        time.sleep(1) # transition
        tabs_container = page.locator("#step-2-tabs")
        if tabs_container.is_visible():
             print("SUCCESS: Step 2 Tabs container found.")
             if page.locator("button:has-text('Prezentace')").is_visible():
                  print("SUCCESS: 'Prezentace' tab found.")
        else:
             # Maybe the id is different, let's check content
             if "Prezentace" in page.content() and "Kvíz" in page.content():
                  print("SUCCESS: Tabs text found in Step 2.")
             else:
                  print("FAILURE: Tabs missing in Step 2.")

        # 6. Verify AI Panel (Read Only)
        # Click "AI Asistent" tab or similar if exists, or check the panel if it's always there
        # The request said "public/js/views/professor/editor/ai-generator-panel.js"
        # We need to find where this panel is rendered. usually inside the tabs.

        browser.close()

if __name__ == "__main__":
    verify_professor_ui()
