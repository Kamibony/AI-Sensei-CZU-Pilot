import re
import time
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

    try:
        # Go to the app
        page.goto("http://localhost:5000")

        # --- Professor Flow: Create a lesson with new content types ---
        print("Logging in as professor...")
        page.get_by_role("button", name="Vstoupit jako Profesor").click()

        # Wait for the professor's dashboard to load
        expect(page.locator("#dashboard-professor")).to_be_visible(timeout=10000)
        print("Professor dashboard loaded.")

        # Create a new lesson
        page.get_by_role("button", name="+ Nová lekce").click()
        expect(page.get_by_role("heading", name="Vytvořit novou lekci")).to_be_visible()
        print("Creating a new lesson.")

        # Fill in lesson details
        page.get_by_placeholder("Např. Úvod do organické chemie").fill("Dynamically Generated Lesson")
        page.get_by_placeholder("Základní pojmy a principy").fill("A test for dynamic tabs")
        page.get_by_placeholder("Např. 101").fill("DYN-101")
        page.get_by_role("button", name="Uložit změny").click()

        # Wait for navigation back to the main professor view after save
        expect(page.get_by_role("heading", name="Plán výuky")).to_be_visible(timeout=10000)
        print("Lesson details saved.")

        # Find the newly created lesson and click to edit it
        page.get_by_text("Dynamically Generated Lesson").first.click()
        expect(page.get_by_role("heading", name="Dynamically Generated Lesson")).to_be_visible()
        print("Editing the new lesson.")

        # Add Presentation Data
        page.get_by_role("link", name="🖼️ Prezentace").click()
        expect(page.get_by_role("heading", name="AI Prezentace")).to_be_visible()
        # This is a hacky way to add data without using the AI generation.
        # We manually trigger the save function with pre-defined data.
        page.evaluate("""
            window.handleSaveGeneratedContent(
                window.currentLesson,
                'presentation',
                { slides: [{ title: 'Test Slide', points: ['Point 1', 'Point 2'] }] }
            )
        """)
        print("Presentation data added.")

        # Add Quiz Data
        page.get_by_role("link", name="❓ Kvíz").click()
        expect(page.get_by_role("heading", name="Interaktivní Kvíz")).to_be_visible()
        page.evaluate("""
            window.handleSaveGeneratedContent(
                window.currentLesson,
                'quiz',
                { questions: [{ question_text: 'Is this a test?', options: ['Yes', 'No'], correct_option_index: 0 }] }
            )
        """)
        print("Quiz data added.")

        # Log out from professor account
        page.get_by_role("button", name="Odhlásit").click()
        expect(page.get_by_role("heading", name="Vítejte v AI Sensei")).to_be_visible()
        print("Logged out from professor account.")

        # --- Student Flow: Verify the new tabs ---
        print("Logging in as student...")
        # Register a new student to avoid conflicts
        page.get_by_role('link', name='Nemáte účet? Zaregistrujte se').click()

        # Generate a unique email using a timestamp
        unique_email = f"student.test.{int(time.time())}@example.com"
        print(f"Registering with unique email: {unique_email}")

        page.locator("#register-email").fill(unique_email)
        page.locator("#register-password").fill("password123")
        page.get_by_role("button", name="Zaregistrovat").click()

        # Wait for student dashboard to load
        expect(page.get_by_role("heading", name="Váš přehled")).to_be_visible(timeout=10000)
        print("Student dashboard loaded.")

        # Find and click the new lesson card, not just the text
        page.locator(".student-lesson-card", has_text="Dynamically Generated Lesson").first.click()

        # Wait for the lesson view to load
        expect(page.get_by_role("heading", name="Dynamically Generated Lesson")).to_be_visible()
        print("Student lesson view loaded.")

        # Verify the Presentation tab is visible and click it
        presentation_tab = page.get_by_role("button", name="Prezentace")
        expect(presentation_tab).to_be_visible()
        presentation_tab.click()
        expect(page.get_by_text("Test Slide")).to_be_visible()
        print("Presentation tab verified.")

        # Verify the Quiz tab is visible and click it
        quiz_tab = page.get_by_role("button", name="Kvíz")
        expect(quiz_tab).to_be_visible()
        quiz_tab.click()
        expect(page.get_by_text("Is this a test?")).to_be_visible()
        print("Quiz tab verified.")

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Screenshot taken.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)