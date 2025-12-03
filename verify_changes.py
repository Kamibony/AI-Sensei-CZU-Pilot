
from playwright.sync_api import sync_playwright, expect

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the test verification page
        page.goto("http://localhost:8000/test_verification.html")

        # Wait for components to load
        page.wait_for_selector("ai-generator-panel")

        # 1. Verify Quiz View (Config Driven)
        print("Verifying Quiz View...")
        quiz_panel = page.locator("#quiz-container ai-generator-panel")

        # Check for Question Count input
        question_count_label = quiz_panel.locator("label:text('Počet otázek')")
        expect(question_count_label).to_be_visible()

        question_count_input = quiz_panel.locator("input[type='number']")
        expect(question_count_input).to_have_value("5")
        expect(question_count_input).to_have_id("question_count")

        # Check for Difficulty select
        difficulty_label = quiz_panel.locator("label:text('Obtížnost')")
        expect(difficulty_label).to_be_visible()

        difficulty_select = quiz_panel.locator("select")
        expect(difficulty_select).to_have_value("Střední")
        expect(difficulty_select).to_have_id("difficulty")

        # 2. Verify Podcast View (Config Driven)
        print("Verifying Podcast View...")
        podcast_panel = page.locator("#podcast-container ai-generator-panel")

        episode_count_label = podcast_panel.locator("label:text('Počet epizod')")
        expect(episode_count_label).to_be_visible()

        episode_count_input = podcast_panel.locator("input[type='number']")
        expect(episode_count_input).to_have_value("3")
        expect(episode_count_input).to_have_id("episode_count")

        # 3. Verify Test View (Legacy Slot Fallback)
        print("Verifying Test View...")
        test_panel = page.locator("#test-container ai-generator-panel")

        # Check inputs that were slotted
        test_question_label = test_panel.locator("label:text('Počet otázek')")
        expect(test_question_label).to_be_visible()

        test_question_input = test_panel.locator("#question-count-input")
        expect(test_question_input).to_be_visible()
        expect(test_question_input).to_have_value("5")

        # Take screenshot
        page.screenshot(path="verification_screenshot.png", full_page=True)
        print("Verification successful! Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
