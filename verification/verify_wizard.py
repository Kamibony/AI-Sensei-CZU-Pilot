
from playwright.sync_api import Page, expect, sync_playwright
import time

def test_wizard_flow(page: Page):
    # 1. Login
    print("Navigating to home...")
    page.goto("http://127.0.0.1:5000/")

    # Select Professor Role
    print("Selecting role...")
    try:
        page.get_by_role("button", name="Vstoupit jako profesor").click()
    except:
        print("Already on login page or role selection skipped")

    # Login
    print("Logging in...")
    page.fill("#login-email", "profesor@profesor.cz")
    page.fill("#login-password", "password123")
    page.click("#login-btn")

    # Wait for dashboard
    print("Waiting for dashboard...")
    try:
        page.wait_for_selector("#dashboard-container", timeout=15000)
    except:
        print("Dashboard container not found. Current URL:", page.url)
        # Maybe we are on student dashboard or still loading?
        # Check if there is an error message
        if page.get_by_text("Error").count() > 0:
             print("Error detected on page.")
        raise

    # 2. Start New Lesson
    print("Clicking New Lesson...")
    time.sleep(2)

    # Look for "Knihovna lekcí" in the sidebar/nav
    try:
        # It might be an icon or text.
        # Let's try locating by text "Knihovna lekcí"
        page.get_by_text("Knihovna lekcí").first.click()
        time.sleep(1)

        # Now look for "Vytvořit novou lekci" button
        # It might be a button with text "Vytvořit novou lekci" or just "Vytvořit"
        page.get_by_text("Vytvořit novou lekci").click()
    except Exception as e:
        print(f"Navigation failed: {e}. Trying fallback...")
        # Fallback: try to find any button with "Vytvořit" or "Nová"
        # Or maybe we are already on the dashboard and there is a Quick Action card?
        # Let's try to force open the editor via JS if possible, or just fail with screenshot
        pass

    print("Waiting for editor...")
    page.wait_for_selector("lesson-editor", timeout=5000)

    # 3. Verify Step 1: Informace
    print("Verifying Step 1...")
    expect(page.get_by_text("Informace")).to_be_visible()

    # Fill Title (Required)
    page.fill("#lesson-title-input", "Playwright Test Lesson")

    # Click Next
    print("Clicking Next (Step 1 -> 2)...")
    page.get_by_role("button", name="Dále").click()

    # 4. Verify Step 2: Obsah
    print("Verifying Step 2...")
    # Check for content type selector
    expect(page.get_by_text("Jaký obsah chcete vytvořit?")).to_be_visible()

    # Select Text
    print("Selecting Text content...")
    page.get_by_text("Text pro studenty").click()

    # Verify Editor and AI Button
    expect(page.get_by_text("Změnit typ obsahu")).to_be_visible()
    # Verify new AI button styling/text
    # Note: The text includes an emoji, so we match loosely or by role
    ai_btn = page.locator("button").filter(has_text="Vygenerovat pomocí AI")
    expect(ai_btn).to_be_visible()

    # Click Next
    print("Clicking Next (Step 2 -> 3)...")
    page.get_by_role("button", name="Dále").click()

    # 5. Verify Step 3: Dokončení
    print("Verifying Step 3...")
    expect(page.get_by_text("Lekce je připravena!")).to_be_visible()
    expect(page.get_by_text("Playwright Test Lesson")).to_be_visible()

    save_btn = page.locator("#save-lesson-btn")
    expect(save_btn).to_be_visible()
    # expect(save_btn).to_have_text("Uložit a dokončit")

    # 6. Screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/wizard_step3.png")
    print("Done.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_wizard_flow(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
