from playwright.sync_api import sync_playwright

def verify(page):
    logs = []
    page.on("console", lambda msg: logs.append(msg.text))
    page.on("pageerror", lambda exc: print(f"Page Error: {exc}"))

    page.goto("http://localhost:8080/verify_fixes.html")

    # Wait for modules to load
    page.wait_for_timeout(2000)

    print("Initial Logs:", logs)

    page.evaluate("""() => {
        if (!window.GuideBot) throw new Error("GuideBot not loaded");

        const bot = document.getElementById('bot');

        // Mock tourGuide to avoid errors
        bot.tourGuide = { start: () => console.log("[MockTour] Started") };

        // Case 1: timeline
        console.log("Testing Case 1: timeline");
        bot.currentView = 'timeline';
        bot.startTour();

        // Case 2: editor
        console.log("Testing Case 2: editor");
        bot.currentView = 'editor';
        bot.startTour();

        // Case 3: professor-lesson-editor
        console.log("Testing Case 3: professor-lesson-editor");
        bot.currentView = 'professor-lesson-editor';
        bot.startTour();
    }""")

    print("Logs captured:")
    for l in logs:
        print(l)

    # Verify logs contain expected resolution
    has_planner = any("Resolved Topic Key: 'planner'" in l for l in logs)
    has_editor = any("Resolved Topic Key: 'editor'" in l for l in logs)

    if not has_planner:
        raise Exception("GuideBot failed to resolve 'timeline' to 'planner'")
    if not has_editor:
        raise Exception("GuideBot failed to resolve 'editor' to 'editor'")

    print("GuideBot Routing Verified!")

    # 2. Verify LessonEditor Light DOM
    page.evaluate("""() => {
        if (!window.LessonEditor) throw new Error("LessonEditor not loaded");
        const editor = document.getElementById('editor');
        const root = editor.createRenderRoot();
        if (root !== editor) {
            throw new Error("LessonEditor createRenderRoot did NOT return this");
        }
        console.log("LessonEditor Light DOM Verified");
    }""")

    page.screenshot(path="verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify(page)
        except Exception as e:
            print("Verification Failed:", e)
            exit(1)
        finally:
            browser.close()
