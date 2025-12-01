
import os
import re
import time
from playwright.sync_api import sync_playwright, expect

# Ensure verification directory exists
if not os.path.exists("verification"):
    os.makedirs("verification")

def verify_student_dashboard(page):
    print("Navigating to application...")
    # The emulator log says Hosting is on port 5000.
    # Previous attempt on 5002 failed.
    # We will try 5000 directly.

    page.goto("http://localhost:5000")

    # Wait for the role selection page
    print("Waiting for role selection...")
    expect(page.get_by_text("Vstoupit jako student")).to_be_visible(timeout=30000)

    # Click "Vstoupit jako student"
    print("Entering as student...")
    page.get_by_text("Vstoupit jako student").click()

    # Login/Register
    print("Waiting for login/register form...")
    # Expect email input
    expect(page.get_by_placeholder("Váš email")).to_be_visible()

    # Register a new student
    email = f"student_{int(time.time())}@test.com"
    password = "password123"

    print(f"Registering user {email}...")

    # Switch to registration if needed.
    if page.get_by_text("Nemáte účet? Zaregistrujte se").is_visible():
        page.get_by_text("Nemáte účet? Zaregistrujte se").click()

    page.get_by_placeholder("Váš email").fill(email)
    page.get_by_placeholder("Vaše heslo").fill(password)
    # Confirm password if exists
    if page.get_by_placeholder("Zadejte heslo znovu").is_visible():
        page.get_by_placeholder("Zadejte heslo znovu").fill(password)

    page.get_by_role("button", name="Zaregistrovat se").click()

    # Wait for dashboard
    print("Waiting for dashboard...")
    # We expect "Vítejte ve svém studijním centru" or similar text from the new dashboard
    expect(page.get_by_text("Vítejte ve svém studijním centru")).to_be_visible(timeout=30000)

    # Verify Dashboard Elements
    print("Verifying dashboard elements...")

    # Header Greeting
    expect(page.get_by_text("Dobrý", exact=False)).to_be_visible() # Dobré ráno/den/večer

    # Streak
    expect(page.get_by_text("Streak")).to_be_visible()

    # Hero Section (Empty State)
    expect(page.get_by_text("Zatím žádné lekce")).to_be_visible()

    # Action Grid
    expect(page.get_by_text("Moje Lekcie")).to_be_visible()
    expect(page.get_by_text("Moje Triedy")).to_be_visible()
    expect(page.get_by_text("Agenda")).to_be_visible()

    # Navigation Test
    print("Testing navigation to Lessons...")
    page.get_by_text("Moje Lekcie").click()

    # Should see "Knihovna lekcí"
    expect(page.get_by_text("Knihovna lekcí")).to_be_visible()

    # Verify Empty State in Lesson List (since new user)
    # Should say "Žádné třídy" (Nejste členem žádné třídy) because new user.
    expect(page.get_by_text("Žádné třídy")).to_be_visible()

    # Navigate back to dashboard (using sidebar)
    print("Navigating back to Dashboard...")
    page.get_by_text("Prehľad").click()
    expect(page.get_by_text("Vítejte ve svém studijním centru")).to_be_visible()

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/student_dashboard.png")
    print("Verification complete!")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            verify_student_dashboard(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/failure.png")
            raise e
        finally:
            browser.close()
