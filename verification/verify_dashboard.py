from playwright.sync_api import sync_playwright, expect
import re

def verify_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the verification page served by the local server
        page.goto("http://localhost:3000/verify_dashboard.html")

        # Wait for the dashboards to render
        page.wait_for_selector("mission-dashboard")

        # Allow some time for LitElement to update
        page.wait_for_timeout(1000)

        # Check Crisis Dashboard
        crisis_dashboard_host = page.locator("#crisis")

        # Check for Title
        expect(crisis_dashboard_host.locator("h4")).to_contain_text("Porucha filtrace")

        # Check for Description
        expect(crisis_dashboard_host.locator("p", has_text="Hladina CO2")).to_be_visible()

        # Check for Call to Action
        expect(crisis_dashboard_host.locator("text=Použijte chat k vyřešení situace!")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/verification.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_dashboard()
