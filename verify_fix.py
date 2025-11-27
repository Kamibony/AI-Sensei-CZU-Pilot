
from playwright.sync_api import sync_playwright
import time
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Start local server for verification dir
    # Actually, we need to serve from root to access public/js...
    # But I put harness in verification/ which is not root.
    # I should serve root and access verification/harness.html if it was there?
    # Or I can copy the public js files? No, too many.

    # Let's assume we run python http.server in root.
    # harness.html is in /home/jules/verification/harness.html
    # We can symlink it or just serve from root and put harness in root temporarily?

    # Or just use the harness content I wrote and serve it.

    # I'll rely on the server running in root.
    page.goto("http://localhost:8000/harness.html")

    # Wait for components to load
    page.wait_for_selector('editor-view-flashcards')

    # Click Generate Flashcards
    print("Clicking Generate Flashcards...")

    # We need to capture console logs to verify the API call structure
    logs = []
    page.on("console", lambda msg: logs.append(msg.text))

    page.locator("editor-view-flashcards button:has-text('Generovat AI')").click()

    # Wait for result
    page.wait_for_timeout(2000)

    # Check logs
    found_call = False
    for log in logs:
        if "MOCKED API CALL DATA" in log:
            print(f"Found API Call: {log}")
            if '"contentType":"flashcards"' in log and '"userPrompt":' in log:
                found_call = True

    if not found_call:
        print("FAILED: Did not find expected API call log for flashcards")
    else:
        print("SUCCESS: Flashcards API call verified")

    # Check Mindmap
    print("Clicking Generate Mindmap...")
    page.locator("editor-view-mindmap button:has-text('AI Generátor')").click()
    page.wait_for_timeout(2000)

    found_mindmap = False
    for log in logs:
         if "MOCKED API CALL DATA" in log and '"contentType":"mindmap"' in log:
             print(f"Found Mindmap API Call: {log}")
             found_mindmap = True

    if not found_mindmap:
        print("FAILED: Did not find expected API call log for mindmap")
    else:
        print("SUCCESS: Mindmap API call verified")

    page.screenshot(path="/home/jules/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
