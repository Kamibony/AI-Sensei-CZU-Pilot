from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            page.goto("http://localhost:8080/verification_harness.html")

            # Wait a bit for components to hydrate and render
            page.wait_for_timeout(2000)

            # Verify Students Title
            print("Checking students-title...")
            students_title = page.locator('[data-tour="students-title"]')
            expect(students_title).to_be_visible()
            print("Students Title found")

            # Verify Light DOM for Students View
            shadow_root = page.evaluate("document.querySelector('professor-students-view').shadowRoot")
            if shadow_root is not None:
                print("FAILURE: professor-students-view has Shadow Root!")
            else:
                print("SUCCESS: professor-students-view is in Light DOM.")

            # Verify Analytics Title
            print("Checking analytics-title...")
            analytics_title = page.locator('[data-tour="analytics-title"]')
            expect(analytics_title).to_be_visible()
            print("Analytics Title found")

            # Verify Light DOM for Analytics View
            shadow_root = page.evaluate("document.querySelector('professor-analytics-view').shadowRoot")
            if shadow_root is not None:
                print("FAILURE: professor-analytics-view has Shadow Root!")
            else:
                print("SUCCESS: professor-analytics-view is in Light DOM.")

            # Verify Media Title
            print("Checking media-title...")
            media_title = page.locator('[data-tour="media-title"]')
            expect(media_title).to_be_visible()
            print("Media Title found")

             # Verify Light DOM for Media View
            shadow_root = page.evaluate("document.querySelector('professor-media-view').shadowRoot")
            if shadow_root is not None:
                print("FAILURE: professor-media-view has Shadow Root!")
            else:
                print("SUCCESS: professor-media-view is in Light DOM.")

            # Verify Practice Title
            print("Checking practice-title...")
            practice_title = page.locator('[data-tour="practice-title"]')
            expect(practice_title).to_be_visible()
            print("Practice Title found")

             # Verify Light DOM for Practice View
            shadow_root = page.evaluate("document.querySelector('practice-view').shadowRoot")
            if shadow_root is not None:
                print("FAILURE: practice-view has Shadow Root!")
            else:
                print("SUCCESS: practice-view is in Light DOM.")

            page.screenshot(path="verification/tour_verification.png", full_page=True)
            print("Verification complete, screenshot saved.")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/tour_failure.png", full_page=True)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
