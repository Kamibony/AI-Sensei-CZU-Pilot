import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Listen for all console messages and print them
        page.on("console", lambda msg: print(f"CONSOLE LOG: {msg.text}"))

        # Listen for and print any uncaught exceptions on the page
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        print("Navigating to the application...")
        try:
            await page.goto("http://127.0.0.1:5000", wait_until="networkidle")
            print("Navigation complete. Waiting for a moment to capture logs...")
            await page.wait_for_timeout(5000) # Wait 5 seconds to ensure all scripts have tried to load
            await page.screenshot(path="jules-scratch/verification/debug_screenshot.png")
            print("Screenshot taken. Check debug_screenshot.png and console output.")

        except Exception as e:
            print(f"An error occurred during navigation: {e}")

        finally:
            await browser.close()

asyncio.run(main())