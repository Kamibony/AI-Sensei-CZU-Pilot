import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            record_video_dir="verification/videos",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # Enable console logging
        def log_console(msg):
            print(f"CONSOLE: {msg.text}")
        page.on("console", log_console)

        print("Navigating to homepage...")
        await page.goto("http://localhost:5000")

        # Wait for app to init
        await page.wait_for_timeout(2000)

        # Hide emulator warning
        await page.add_style_tag(content=".firebase-emulator-warning { display: none !important; }")

        print("Injecting Admin Creation...")
        try:
            await page.evaluate("""async () => {
                console.log("Importing Auth...");
                const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
                const auth = getAuth();
                const email = "profesor@profesor.cz";
                const password = "password123";

                console.log("Attempting to create admin user...");
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                    console.log("Admin user created successfully.");
                } catch (e) {
                    if (e.code === 'auth/email-already-in-use') {
                        console.log("Admin user already exists. Signing in...");
                        await signInWithEmailAndPassword(auth, email, password);
                        console.log("Admin user signed in.");
                    } else {
                        throw e;
                    }
                }
            }""")
        except Exception as e:
            print(f"Injection failed: {e}")

        # 4. Wait for Dashboard
        print("Waiting for dashboard...")
        try:
            # Looking for the "Start New Lesson" text
            await page.wait_for_selector("text=Start New Lesson", timeout=30000)
            print("Dashboard loaded!")
        except Exception as e:
             print(f"Dashboard load failed: {e}")
             await page.screenshot(path="verification/dashboard_fail_bypass.png")
             await browser.close()
             return

        # 5. Capture Dashboard Screenshot
        await page.screenshot(path="verification/dashboard_bypass.png")
        print("Dashboard screenshot saved.")

        # 7. Navigate to Editor (Zen Mode)
        print("Navigating to Editor...")
        await page.click("text=Start New Lesson")

        await page.wait_for_selector("lesson-editor")
        await page.wait_for_selector("input#lesson-title-input")

        await page.screenshot(path="verification/editor_zen_bypass.png")
        print("Editor screenshot saved.")

        print("Testing Editor Interaction...")
        await page.fill("input#lesson-title-input", "Modern AI Lesson")

        # "Pokračovat"
        await page.click("button:has-text('Pokračovat')")

        # Wait for Step 2
        await page.wait_for_selector("text=Co vytvoříme?")

        await page.screenshot(path="verification/editor_step2_bypass.png")
        print("Editor Step 2 screenshot saved.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
