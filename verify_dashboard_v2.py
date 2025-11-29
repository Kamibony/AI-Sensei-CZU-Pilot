from playwright.sync_api import sync_playwright, Page, expect
import time
import sys
import os

def verify_ui_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Navigating to app...")
        try:
            page.goto("http://localhost:8000/public/")
        except Exception as e:
            print(f"Error connecting to server: {e}")
            return

        try:
            page.wait_for_selector("#app-container", timeout=5000)
        except:
            print("Timeout waiting for app container.")

        print("--- Verifying Professor Dashboard Structure ---")

        page.evaluate("""
            (async () => {
                await import('./js/views/professor/professor-dashboard-view.js');
                const app = document.getElementById('role-content-wrapper') || document.body;
                app.innerHTML = '';
                const dashboard = document.createElement('professor-dashboard-view');
                dashboard.id = 'test-dashboard';
                app.appendChild(dashboard);
                await customElements.whenDefined('professor-dashboard-view');
                dashboard._classes = [
                    { id: '1', name: 'Math 101', studentIds: ['s1', 's2'] },
                    { id: '2', name: 'Physics 202', studentIds: [] }
                ];
                dashboard._students = [{id: 's1'}, {id: 's2'}];
                dashboard._lessons = [
                    { id: 'l1', assignedToGroups: ['1'] },
                    { id: 'l2', assignedToGroups: [] }
                ];
                dashboard._isLoading = false;
                dashboard.requestUpdate();
            })();
        """)

        time.sleep(2)

        page.screenshot(path="dashboard_verification.png")
        print("📸 Dashboard screenshot saved to dashboard_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_ui_changes()
