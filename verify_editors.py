from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the test harness
        # Since python server is serving 'public' as root, we access test_editors.html directly
        page.goto("http://localhost:8000/test_editors.html")

        # Wait for elements to be visible
        try:
            expect(page.locator("#mindmap-empty")).to_be_visible(timeout=5000)

            # Wait a bit for web components to render
            time.sleep(2)

            # Take screenshot of the whole page
            page.screenshot(path="/home/jules/verification/editors_all.png", full_page=True)

            # Take specific screenshots
            page.locator("#mindmap-empty").screenshot(path="/home/jules/verification/mindmap_empty.png")
            page.locator("#mindmap-full").screenshot(path="/home/jules/verification/mindmap_full.png")
            page.locator("#comic-empty").screenshot(path="/home/jules/verification/comic_empty.png")
            page.locator("#comic-full").screenshot(path="/home/jules/verification/comic_full.png")
            page.locator("#post-view").screenshot(path="/home/jules/verification/post_view.png")

            print("Screenshots taken successfully")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
