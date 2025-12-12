from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/test_editor_fix.html")

        try:
            expect(page.locator("#comic-full")).to_be_visible(timeout=5000)
            time.sleep(2)

            # Screenshot the fixed comic editor
            page.locator("#comic-full").screenshot(path="/home/jules/verification/comic_fix.png")
            print("Screenshot taken")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
