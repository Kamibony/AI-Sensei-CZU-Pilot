import os
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    # Mock Auth
    page.add_init_script("""
        window.mockUser = {
            uid: '123',
            email: 'profesor@profesor.cz',
            role: 'professor',
            getIdTokenResult: async () => ({ claims: { role: 'professor' } })
        };
    """)

    # Mock Firebase Init
    page.route("**/firebase-init.js", lambda route: route.fulfill(
        status=200,
        content_type="application/javascript",
        body="""
            export const auth = { currentUser: window.mockUser, onAuthStateChanged: (cb) => cb(window.mockUser) };
            export const db = {};
            export const functions = {};
            export const storage = {};
            export const initializeFirebase = async () => {};
        """
    ))

    # Mock Professor Data Service
    page.route("**/professor-data-service.js", lambda route: route.fulfill(
        status=200,
        content_type="application/javascript",
        body="""
            export class ProfessorDataService {
                async fetchLessons() { return []; }
                async fetchLessonById(id) {
                    if (id === 'design-lesson') {
                        return { id: 'design-lesson', title: 'Design Lesson', files: [{name: 'syllabus.pdf', storagePath: 'path/to.pdf'}] };
                    }
                    if (id === 'command-lesson') {
                        return {
                            id: 'command-lesson',
                            title: 'Command Lesson',
                            mission_config: {
                                active: true,
                                roles: [{title: 'Analyst', description: 'Analyzes data', skills: ['Analysis']}],
                                milestones: [{title: 'Phase 1', description: 'Kickoff'}],
                                graph: { nodes: [], edges: [] }
                            }
                        };
                    }
                    return null;
                }
            }
        """
    ))

    print("Verifying Sidebar...")
    # 1. Verify Sidebar (No Wizard)
    page.goto("http://localhost:3000/#dashboard")
    # Wait for dashboard to render
    page.wait_for_timeout(3000)

    page.screenshot(path="verification/sidebar.png")

    # Check if "Nový Modul" is absent.
    # Note: "Nový Modul" text might be present in translation files, but we check rendered text.
    # We look for the button text.
    # We can inspect the sidebar content.
    sidebar = page.locator("app-navigation")
    if sidebar.is_visible():
        text_content = sidebar.text_content()
        if "Nový Modul" not in text_content and "Tvůrčí studio" in text_content:
             print("SUCCESS: 'Nový Modul' not found in sidebar.")
        elif "Nový Modul" in text_content:
             print("FAILURE: 'Nový Modul' FOUND in sidebar.")
        else:
             print("WARNING: Sidebar content unclear.")

    print("Verifying Design Phase...")
    # 2. Verify Design Phase
    page.goto("http://localhost:3000/#editor/design-lesson")
    page.wait_for_timeout(3000)

    # Try to switch to Mission tab
    # Depending on how LessonEditor renders tabs.
    # We click the tab that contains "Misia"
    try:
        page.get_by_text("Misia").click()
        page.wait_for_timeout(1000)
    except:
        print("Could not click 'Misia' tab. Maybe it's already active or not found.")

    page.screenshot(path="verification/mission_design.png")

    # Check for "Mission Architect" or "Design Phase"
    content = page.content()
    if "Mission Architect" in content or "Design Phase" in content or "Mission Control" in content: # Using English keys for safety if translation fail, or localized if mocked?
        # I didn't mock translation service, so it should load real locales.
        # "Mission Architect" key is 'mission.architect_title' -> "Mission Architect" (I put English in cs.json? No I put "Mission Architect")
        print("SUCCESS: Design Phase UI loaded.")
    else:
        print("FAILURE: Design Phase UI not found.")


    print("Verifying Command Phase...")
    # 3. Verify Command Phase
    page.goto("http://localhost:3000/#editor/command-lesson")
    page.wait_for_timeout(3000)

    try:
        page.get_by_text("Misia").click()
        page.wait_for_timeout(1000)
    except:
        print("Could not click 'Misia' tab.")

    page.screenshot(path="verification/mission_command.png")

    content = page.content()
    if "Mission Control" in content or "Active" in content:
        print("SUCCESS: Command Phase UI loaded.")
    else:
        print("FAILURE: Command Phase UI not found.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
