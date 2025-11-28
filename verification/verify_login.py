from playwright.sync_api import sync_playwright, expect
import time

def verify_login_redesign():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Starting verification...")

        # 1. Start a simple HTTP server to serve the public directory
        # We need this because we are using ES modules
        import subprocess
        import sys

        # Kill any existing python http servers
        subprocess.run(["pkill", "-f", "http.server"], check=False)

        server_process = subprocess.Popen(
            [sys.executable, "-m", "http.server", "8000", "--directory", "public"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        time.sleep(2) # Wait for server to start

        try:
            # 2. Go to the app
            page.goto("http://localhost:8000/index.html")

            # Wait for app to load
            # Note: app.js initializes auth, which might take a moment.
            # We are looking for the <login-view> component.

            # Since we don't have a backend running, the initial auth check might hang or fail.
            # However, login-view should be rendered if no user is authenticated.

            # Wait for login-view to appear
            page.wait_for_selector("login-view", state="attached", timeout=10000)

            # Check for Role Selection State (Initial)
            print("Checking Role Selection State...")

            # We need to pierce the shadow DOM of login-view
            # But Playwright handles this automatically usually.
            # Let's try to find "Jsem Profesor" text.

            # Wait for the text to appear
            professor_card = page.get_by_role("button", name="Jsem Profesor")
            expect(professor_card).to_be_visible(timeout=10000)

            print("Found Professor Card. Taking screenshot of Role Selection...")
            page.screenshot(path="verification/1_role_selection.png")

            # 3. Click "Jsem Student"
            print("Clicking Student Card...")
            student_card = page.get_by_role("button", name="Jsem Student")
            student_card.click()

            # 4. Verify Student Login Form appears
            print("Verifying Student Login Form...")
            # Should see "Přihlášení pro studenty"
            student_login_title = page.get_by_role("heading", name="Přihlášení pro studenty")
            expect(student_login_title).to_be_visible()

            # Should see "Back" button
            back_btn = page.get_by_role("button", name="Zpět na výběr role")
            expect(back_btn).to_be_visible()

            print("Taking screenshot of Student Login Form...")
            page.screenshot(path="verification/2_student_login.png")

            # 5. Click Back
            print("Clicking Back...")
            back_btn.click()

            # Verify we are back to role selection
            expect(professor_card).to_be_visible()
            print("Back to Role Selection verified.")

            # 6. Click Professor
            print("Clicking Professor Card...")
            professor_card.click()

            # Verify Professor Login Form
            print("Verifying Professor Login Form...")
            prof_login_title = page.get_by_role("heading", name="Přihlášení pro profesory")
            expect(prof_login_title).to_be_visible()

            # Verify Google Login button exists (Professor only)
            google_btn = page.get_by_role("button", name="Vstoupit jako profesor")
            expect(google_btn).to_be_visible()

            print("Taking screenshot of Professor Login Form...")
            page.screenshot(path="verification/3_professor_login.png")

            print("Verification Complete!")

        except Exception as e:
            print(f"Verification Failed: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            server_process.terminate()
            browser.close()

if __name__ == "__main__":
    verify_login_redesign()
