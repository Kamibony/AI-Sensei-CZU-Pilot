import time
from playwright.sync_api import sync_playwright

def verify_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock chat-panel.js
        mock_chat_panel = """
        import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
        export class ChatPanel extends LitElement {
            createRenderRoot() { return this; }
            render() {
                return html`<div style="background: white; height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; color: black; font-weight: bold;">MOCK CHAT PANEL</div>`;
            }
        }
        customElements.define('chat-panel', ChatPanel);
        """

        def handle_chat_panel(route):
            print(f"Intercepted: {route.request.url}")
            route.fulfill(
                status=200,
                content_type="application/javascript",
                body=mock_chat_panel
            )

        # Intercept the import of chat-panel.js
        page.route("**/js/views/student/chat-panel.js", handle_chat_panel)

        print("Navigating to test page...")
        page.goto("http://localhost:3000/test-mission-dashboard.html")

        print("Waiting for dashboard...")
        try:
            page.wait_for_selector("mission-dashboard", state="attached", timeout=5000)

            # Wait for data simulation (timeout 100ms + render time)
            time.sleep(2)

            print("Taking screenshot...")
            page.screenshot(path="verification/mission_dashboard.png")
            print("Screenshot saved to verification/mission_dashboard.png")
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    verify_dashboard()
