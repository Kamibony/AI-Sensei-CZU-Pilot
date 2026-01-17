
import os
import time
import subprocess
import sys
from playwright.sync_api import sync_playwright

def run_verification():
    # 1. Start HTTP Server
    # Check if port 8080 is in use, kill it if so (basic cleanup)
    os.system("kill $(lsof -t -i :8080) 2>/dev/null || true")

    server_process = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8080"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    print("Server started on port 8080")

    # Give it a moment to start
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # 2. Navigate to verification page
            url = "http://localhost:8080/verification/verify_practice_manual_input.html"
            print(f"Navigating to {url}")
            page.goto(url)

            # 3. Wait for results
            # The HTML script updates body with success or fail message
            try:
                # Wait for either success or fail message
                page.wait_for_selector("h1", timeout=10000) # 10 seconds timeout
            except Exception as e:
                print("Timeout waiting for test results")
                page.screenshot(path="verification/timeout.png")
                raise e

            # 4. Take Screenshot
            page.screenshot(path="verification/verification_result.png")
            print("Screenshot saved to verification/verification_result.png")

            # 5. Check Content
            content = page.content()
            if "ALL TESTS PASSED" in content:
                print("VERIFICATION SUCCESSFUL")
            elif "TEST FAILED" in content:
                print("VERIFICATION FAILED")
                # Get the error message
                failure = page.eval_on_selector("h1[style*='red']", "el => el.textContent")
                print(f"Failure Reason: {failure}")
                sys.exit(1)
            else:
                print("Unknown state")
                sys.exit(1)

    finally:
        # Cleanup
        server_process.terminate()
        server_process.wait()

if __name__ == "__main__":
    run_verification()
