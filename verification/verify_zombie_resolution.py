from playwright.sync_api import sync_playwright, expect

def test_zombie_resolution():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Subscribe to console events
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Browser Error: {exc}"))

        # Navigate to the test harness
        page.goto("http://localhost:8080/test_verification_student_practice.html")

        # Wait for the component to be attached to DOM
        page.wait_for_selector("student-practice-view", state="attached")

        # Wait for task text
        # If imports fail, this will timeout.
        try:
            task_locator = page.locator(".task-box")
            expect(task_locator).to_contain_text("NEWEST CORRECT TASK", timeout=5000)

            # Ensure it does NOT contain the old task
            expect(task_locator).not_to_contain_text("OLD ZOMBIE TASK")

            print("Verification Successful: Displayed correct newest task.")
        except Exception as e:
            print(f"Verification Failed: {e}")
            # Take screenshot anyway for debugging

        page.screenshot(path="verification/verification.png")
        browser.close()

if __name__ == "__main__":
    test_zombie_resolution()
