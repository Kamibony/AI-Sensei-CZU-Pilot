import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright, expect

def run_server():
    """Starts a simple HTTP server serving the 'public' directory."""
    # Ensure we serve from the 'public' directory
    # We assume the script is run from the root of the repo
    public_dir = os.path.join(os.getcwd(), "public")
    os.chdir(public_dir)

    PORT = 5000
    Handler = http.server.SimpleHTTPRequestHandler
    # Use allow_reuse_address to avoid "Address already in use" errors on restart
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def verify_lesson_editor_automagic_static_checks():
    """
    Verifies that the Lesson Editor component loads and runs in the test harness.
    """
    print("Starting verification of Lesson Editor with local server...")

    # Start server in a background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(2) # Give it a moment to start

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the test harness
            url = "http://localhost:5000/test_editor.html"
            print(f"Navigating to {url}")
            page.goto(url)

            # Check for console errors
            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            # Wait for load
            page.wait_for_load_state("networkidle")
            print("Page loaded.")

            # Take a screenshot
            if not os.path.exists("../screenshots_lite"):
                os.makedirs("../screenshots_lite")

            screenshot_path = "../screenshots_lite/automagic_verification.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot taken: {screenshot_path}")

        except Exception as e:
            print(f"Error during verification: {e}")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_lesson_editor_automagic_static_checks()
