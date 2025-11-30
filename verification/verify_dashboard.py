from playwright.sync_api import sync_playwright
import time
import sys
import random
import string

def verify_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Capture console logs to debug JS errors
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5000")

            # 1. Role Selection
            print("Waiting for role selection...")
            try:
                page.wait_for_selector("text=Jsem Profesor", state="visible", timeout=3000)
                page.click("text=Jsem Profesor")
                print("Clicked 'Jsem Profesor'")
            except Exception:
                print("Could not find 'Jsem Profesor'. Assuming already on login/register page.")

            # 2. Robust Auth Flow: Register -> Fallback to Login
            print("Attempting Registration...")
            try:
                page.wait_for_selector("#login-email", state="visible", timeout=3000)
            except:
                pass

            if page.is_visible("text=Zaregistrujte se"):
                page.click("text=Zaregistrujte se")
                print("Clicked 'Zaregistrujte se' link.")

            try:
                page.wait_for_selector("#register-email", state="visible", timeout=3000)
                print("Register form visible.")

                email = "profesor@profesor.cz"
                page.fill("#register-email", email)
                page.fill("#register-password", "password")
                page.click("form:has(#register-email) button[type='submit']")
                print(f"Submitted Registration for {email}")

                # Check for "already in use" by waiting for a bit and checking content
                time.sleep(1) # Give it a moment to process/error

                # If we see the dashboard specific content, great.
                # If not, check for error.
            except Exception:
                pass

            # Always try to switch to login if we suspect failure or just to be safe
            # If dashboard is already there, these checks will fail quickly or be skipped
            if page.is_visible("text=Přihlaste se"): # Check if we are still on register page with link
                 # Check if we have an error displayed
                 if "already in use" in page.content() or "již používán" in page.content():
                     print("User exists. Switching to Login.")
                     page.click("text=Přihlaste se")
                     page.wait_for_selector("#login-email", state="visible", timeout=3000)
                     page.fill("#login-email", "profesor@profesor.cz")
                     page.fill("#login-password", "password")
                     page.click("form:has(#login-email) button[type='submit']")
                     print("Submitted Login.")

            # If we are stuck on Register page but no error visible yet, maybe we should try login anyway?
            # Or assume we are logged in.

            # 3. Verify Dashboard Layout & Content
            print("Waiting for Dashboard Content (Waiting for 'Magická lekce')...")
            # Wait for specific card content that is ONLY in the new dashboard view
            try:
                page.wait_for_selector("text=Magická lekce", timeout=15000)
                print("✅ Found 'Magická lekce' - Dashboard Loaded!")
            except:
                print("Timed out waiting for 'Magická lekce'. Dashboard might be stuck loading or layout is wrong.")

            page.screenshot(path="verification/step2_dashboard.png")
            content = page.content()

            # Verify Layout Fix (CSS Grid)
            print("Verifying Layout CSS...")
            layout_style = page.evaluate("""() => {
                const app = document.querySelector('professor-app');
                const layout = app.querySelector('.app-layout');
                if (!layout) return "Layout element not found";
                return window.getComputedStyle(layout).gridTemplateColumns;
            }""")
            print(f"Layout Grid Columns: {layout_style}")

            if "260px" in layout_style:
                 print("✅ Layout Fix Verified (Grid columns match)")
            else:
                 print(f"❌ Layout Fix verification failed. Got: {layout_style}")

            # Verify Cards
            cards = ["Magická lekce", "Manuální tvorba", "Knihovna", "Média & Soubory"]
            missing_cards = [card for card in cards if card not in content]

            if not missing_cards:
                 print("✅ All Creative Studio cards found.")
            else:
                 print(f"❌ Missing cards: {missing_cards}")

            # Verify Header Polish (Logout Pill)
            # Check for "Odhlásit" text (Logout)
            if "Odhlásit" in content:
                 print("✅ Header elements (Logout) found.")
            else:
                 print("❌ Header elements missing.")

            print("Verification Complete.")

        except Exception as e:
            print(f"VERIFICATION FAILED: {e}")
            page.screenshot(path="verification/error.png")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    verify_dashboard()
