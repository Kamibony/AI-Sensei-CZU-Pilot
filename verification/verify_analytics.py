from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))

        page.goto("http://localhost:8080/verification/verify_analytics.html")

        # Wait for any H1, implies rendering started
        try:
            page.wait_for_selector("professor-analytics-view h1", timeout=5000)
        except Exception as e:
            print(f"Wait failed: {e}")
            # Take screenshot anyway to see what's up
            page.screenshot(path="verification/debug.png")
            raise e

        # Check for Research Engine
        page.wait_for_selector("h2:has-text('Research Engine')")

        # Select Class A (value is 'class1' based on mock)
        page.select_option("select", value="class1")

        page.wait_for_selector("h3:has-text('Class Resilience')")
        page.screenshot(path="verification/analytics_verified.png")

        print("Verification script finished successfully.")
        browser.close()

if __name__ == "__main__":
    run()
