from playwright.sync_api import sync_playwright, expect
import re

def verify_editor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the verification page served by the local server
        page.goto("http://localhost:3000/verify_editor.html")

        # Wait for the editor to render
        page.wait_for_selector("editor-view-mission")

        # Allow some time for LitElement to update
        page.wait_for_timeout(1000)

        # Check for Milestones
        editor_host = page.locator("#editor")

        # Check that descriptions are visible
        expect(editor_host.locator("text=Description 1")).to_be_visible()
        expect(editor_host.locator("text=Description 2")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/verification_editor.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_editor()
