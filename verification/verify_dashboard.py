from playwright.sync_api import sync_playwright, expect
import re

def verify_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the verification page served by the local server
        page.goto("http://localhost:3000/verify_dashboard.html")

        # Wait for the dashboards to render
        # We look for the mission-dashboard-container
        page.wait_for_selector(".mission-dashboard-container")

        # Check Normal Dashboard
        # It should contain border-slate-700
        normal_dashboard = page.locator("mission-dashboard").nth(0).locator(".mission-dashboard-container")
        expect(normal_dashboard).to_have_class(re.compile(r"border-slate-700"))

        # Check Crisis Dashboard
        # It should contain border-red-500
        crisis_dashboard = page.locator("mission-dashboard").nth(1).locator(".mission-dashboard-container")
        expect(crisis_dashboard).to_have_class(re.compile(r"border-red-500"))
        expect(crisis_dashboard).to_have_class(re.compile(r"animate-pulse-border"))

        # Take screenshot
        page.screenshot(path="verification/verification.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_dashboard()
