from playwright.sync_api import sync_playwright
import time
import os

def run():
    if not os.path.exists("verification"):
        os.makedirs("verification")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PageError: {err}"))

        try:
            page.goto("http://localhost:8080/verify_localization_temp.html")
            time.sleep(2)

            # Print body content
            content = page.evaluate("document.body.innerHTML")
            print(f"Body content: {content}")

            page.screenshot(path="verification/localization.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
