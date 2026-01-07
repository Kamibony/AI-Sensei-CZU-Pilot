from playwright.sync_api import sync_playwright, expect
import time

def verify_app_loads():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen for console logs
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))

        # Listen for failed requests
        page.on("requestfailed", lambda request: print(f"Request failed: {request.url} - {request.failure}"))

        # Listen for responses to catch 404s/redirects that might look like success but are actually serving index.html
        def check_response(response):
            # If we request a JS file but get HTML, that's our error.
            if response.request.resource_type == "script" and "text/html" in response.headers.get("content-type", ""):
                print(f"MIME TYPE ERROR: Requested {response.url} but got text/html")

        page.on("response", check_response)

        try:
            print("Navigating to app...")
            page.goto("http://127.0.0.1:5000/")

            print("Waiting for content...")
            # Wait for the login component to appear
            page.wait_for_selector("login-view", timeout=5000)

            print("Login view detected. Taking screenshot.")
            page.screenshot(path="verification/app_loaded.png")

            print("Verification successful: App loaded.")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error_state.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app_loads()
