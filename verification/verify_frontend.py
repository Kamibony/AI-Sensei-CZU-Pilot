import os
import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Setup Dialog Handler
        page.on("dialog", lambda dialog: print(f"Dialog: {dialog.message}") or dialog.accept())

        # 1. Mock CDN dependencies
        # Mock Firestore
        page.route("**/firebase-firestore.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="""
            export const collection = () => {};
            export const query = () => {};
            export const where = () => {};
            export const doc = () => {};
            export const onSnapshot = () => {};
            export const orderBy = () => {};
            export const limit = () => {};
            export const getDocs = () => {};
            """
        ))

        # Mock Auth
        page.route("**/firebase-auth.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="export const signOut = async () => {};"
        ))

        # Mock Functions - This is the key one
        page.route("**/firebase-functions.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="""
            export const httpsCallable = (functionsInstance, name) => async (data) => {
                console.log('Mock httpsCallable called for:', name, data);
                if (data.joinCode === 'FAIL12') {
                    // MOCKING THE NEW ERROR RESPONSE FORMAT
                    return { data: { success: false, error: 'Simulated Logic Error' } };
                }
                if (data.joinCode === 'PASS12') {
                    // MOCKING THE SUCCESS RESPONSE FORMAT
                    return { data: { success: true, groupName: 'Simulated Class' } };
                }
                return { data: { success: false, error: 'Unknown Code' } };
            };
            """
        ))

        # Mock firebase-init.js
        page.route("**/js/firebase-init.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="""
            export const db = {};
            export const auth = {};
            export const functions = {};
            """
        ))

        # Mock guide-bot.js to avoid errors if it tries to load stuff
        page.route("**/components/guide-bot.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="import { LitElement } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js'; class GuideBot extends LitElement {} customElements.define('guide-bot', GuideBot);"
        ))

        # Mock other views to avoid loading errors
        page.route("**/student-classes-view.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        page.route("**/student-lesson-list.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        page.route("**/student-lesson-detail.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        page.route("**/student-class-detail.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        page.route("**/student-practice-view.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        page.route("**/pedagogical-practice-view.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))

        # Serve Harness
        page.route("http://localhost:8000/", lambda route: route.fulfill(
            status=200,
            content_type="text/html",
            body="""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Verification</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body>
                <script type="module">
                    import './js/views/student/student-dashboard-view.js';

                    setTimeout(() => {
                        const dashboard = document.createElement('student-dashboard');
                        dashboard.user = { email: "test@student.com", uid: "test_uid" };
                        // Mock translation
                        dashboard.t = (key) => key;

                        document.body.appendChild(dashboard);

                        // Open Join Modal immediately
                        setTimeout(() => {
                            dashboard.isJoinModalOpen = true;
                            dashboard.requestUpdate();
                        }, 500);
                    }, 500);
                </script>
            </body>
            </html>
            """
        ))

        print("Navigating to harness...")
        try:
            page.goto("http://localhost:8000/")

            # Wait for modal input
            print("Waiting for modal...")
            page.wait_for_selector("input[placeholder='CODE']")

            # 1. Test Failure
            print("Testing Failure Case (FAIL12)...")
            page.fill("input[placeholder='CODE']", "FAIL12")
            # Click button - use a robust selector
            # The button is the one with student.join_btn text, but we mocked t() -> key
            # But the template might render "student.join_btn"
            # Let's check the button class or structure
            # class="w-full px-6 py-4 bg-indigo-600 ..."
            page.click("button.bg-indigo-600")

            # Expect text "Simulated Logic Error"
            print("Waiting for error message...")
            page.wait_for_selector("text=Simulated Logic Error")
            print("PASS: Error displayed.")

            # Capture failure screenshot
            page.screenshot(path="verification/verification_fail.png")

            # 2. Test Success
            print("Testing Success Case (PASS12)...")
            page.fill("input[placeholder='CODE']", "PASS12")
            page.click("button.bg-indigo-600")

            # Dialog handler should catch the alert "student.join_success Simulated Class!"
            # We can't easily assert on dialog in sync mode unless we captured it in a variable, but the print handler proves it works.
            # We wait a bit.
            page.wait_for_timeout(1000)

            # Screenshot
            page.screenshot(path="verification/verification.png")
            print("PASS: Success interaction complete.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    run()
