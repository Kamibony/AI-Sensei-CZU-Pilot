from playwright.sync_api import sync_playwright, expect

def verify_mindmap_editor():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Load the verification harness
        print("Navigating to test harness...")
        page.goto("http://localhost:8080/test_verification_mindmap.html")

        # Wait for editor to be visible
        editor = page.locator("#mindmap-editor")
        expect(editor).to_be_visible()

        # 2. Verify Initial Render (Manual Mode/Loaded)
        # Check if mermaid-preview contains SVG (it is async)
        print("Verifying initial render...")
        preview = page.locator("#mermaid-preview")
        # Give it a bit of time for mermaid to render
        page.wait_for_timeout(2000)
        # Check if svg exists inside preview
        expect(preview.locator("svg")).to_be_visible()

        # 3. Test Aggressive Sanitization (Markdown Stripping)
        print("Testing Aggressive Sanitization...")
        # Inject bad markdown via our helper
        bad_input = "```mermaid\\ngraph TD; Sanitized-->Success;\\n```"
        page.evaluate(f"window.triggerAiCompletion('{bad_input}')")

        # Wait for render
        page.wait_for_timeout(2000)

        # Check if we have the new graph
        # We can check the text inside the graph node
        expect(page.get_by_text("Sanitized")).to_be_visible()
        expect(page.get_by_text("Success")).to_be_visible()

        # Verify code in textarea is clean (no backticks)
        textarea = page.locator("textarea")
        code_value = textarea.input_value()
        print(f"Code in textarea: '{code_value}'")
        if "```" in code_value:
             raise Exception("Sanitization Failed: Backticks found in code!")
        if "graph TD; Sanitized-->Success;" not in code_value:
             raise Exception(f"Unexpected code value: {code_value}")

        # 4. Test Error Handling
        print("Testing Error Handling...")
        # Inject syntax error
        # Missing target for arrow
        error_input = "graph TD; A-->"
        page.evaluate(f"window.triggerAiCompletion('{error_input}')")

        page.wait_for_timeout(2000)

        # Verify error message is visible
        # The component renders error in a red span
        # It should contain text from the error.
        # Mermaid usually throws "Parse error on line..."
        error_span = page.locator("span.text-red-600")
        expect(error_span).to_be_visible()
        error_text = error_span.text_content()
        print(f"Error displayed: {error_text}")

        if "Syntax Error" not in error_text and "Parse error" not in error_text and "Error" not in error_text:
             raise Exception(f"Error message does not look right: {error_text}")

        # 5. Test Object Input
        print("Testing Object Input...")
        # Pass an object
        page.evaluate("window.triggerAiCompletion({ mermaid: 'graph TD; Object-->Works;' })")

        page.wait_for_timeout(2000)
        expect(page.get_by_text("Object")).to_be_visible()
        expect(page.get_by_text("Works")).to_be_visible()

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/mindmap_verification.png")

        browser.close()
        print("Verification passed!")

if __name__ == "__main__":
    verify_mindmap_editor()
