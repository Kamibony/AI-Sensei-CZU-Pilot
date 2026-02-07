from playwright.sync_api import sync_playwright
import time
import subprocess
import os
import sys

def test_mission_comms():
    # Start server
    print("Starting server...")
    server_process = subprocess.Popen(["python3", "-m", "http.server", "3000"], cwd="public")
    time.sleep(2) # Wait for server

    try:
        with sync_playwright() as p:
            print("Launching browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Go to harness
            url = "http://localhost:3000/verify_mission_harness.html"
            print(f"Navigating to {url}...")
            page.goto(url)

            # Wait for MissionDashboard
            print("Waiting for mission-dashboard...")
            page.wait_for_selector("mission-dashboard")

            # Wait for MissionComms
            print("Waiting for mission-comms...")
            page.wait_for_selector("mission-comms")

            # Check for Terminal Header
            print("Checking header...")
            header = page.wait_for_selector("text=MISSION://COMMS_LINK")
            if not header.is_visible():
                raise Exception("Header not visible")

            # Check for Role
            print("Checking role...")
            role_text = page.wait_for_selector("text=OP: HACKER")
            if not role_text.is_visible():
                raise Exception("Role not visible")

            # Check for Chat Input
            print("Checking input...")
            input_el = page.wait_for_selector("#mission-chat-input")

            # Type a command
            print("Sending command...")
            input_el.fill("status report")
            input_el.press("Enter")

            # Wait for message to appear
            print("Waiting for message...")
            page.wait_for_selector("text=status report", timeout=5000)

            # Take screenshot
            print("Taking screenshot...")
            if not os.path.exists("verification"):
                os.makedirs("verification")
            page.screenshot(path="verification/mission_comms_verified.png")
            print("Verification successful. Screenshot saved.")

    except Exception as e:
        print(f"Verification failed: {e}")
        # Dump page content
        try:
            print("Page Content:")
            # print(page.content())
        except:
            pass
        sys.exit(1)

    finally:
        server_process.kill()

if __name__ == "__main__":
    test_mission_comms()
