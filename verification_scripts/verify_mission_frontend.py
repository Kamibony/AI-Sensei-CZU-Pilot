import time
from playwright.sync_api import sync_playwright

def run():
    print("Starting verification script...")
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Setting up routes...")

        # Helper to log requests
        # page.on("request", lambda request: print(f"Request: {request.url}"))

        # Mock Firebase App
        page.route("**/firebase-app.js", lambda route: route.fulfill(
             body="""
             export const initializeApp = () => ({});
             export const getApps = () => [];
             export const getApp = () => ({});
             """,
             content_type="application/javascript"
        ))

        # Mock Firebase Auth
        page.route("**/firebase-auth.js", lambda route: route.fulfill(
             body="""
             export const getAuth = () => ({});
             export const connectAuthEmulator = () => {};
             """,
             content_type="application/javascript"
        ))

        # Mock Firebase Analytics
        page.route("**/firebase-analytics.js", lambda route: route.fulfill(
             body="""
             export const getAnalytics = () => ({});
             """,
             content_type="application/javascript"
        ))

        # Mock Firebase Init
        page.route("**/firebase-init.js", lambda route: route.fulfill(
            body="""
            console.log("MOCKED FIREBASE INIT LOADED");
            export const auth = { currentUser: { uid: 'test-user', displayName: 'Test Student' }, onAuthStateChanged: (cb) => { cb({ uid: 'test-user' }); return () => {}; } };
            export const db = {};
            export const functions = {};
            export const storage = {};
            export const analytics = {};
            export function initializeFirebase() {}
            """,
            content_type="application/javascript"
        ))

        # Mock Firestore
        page.route("**/firebase-firestore.js", lambda route: route.fulfill(
            body="""
            export const getFirestore = () => ({});
            export const connectFirestoreEmulator = () => {};
            export const doc = (db, col, id) => {
                 return { path: col + '/' + id, id: id };
            };
            export const getDoc = (ref) => Promise.resolve({
                exists: () => true,
                data: () => ({
                    title: 'Mission Lesson',
                    subject: 'Testing',
                    type: 'standard',
                    text_content: 'Some content',
                    mission_config: { active: true, status: 'active' },
                    language: 'cs'
                })
            });
            export const onSnapshot = (ref, cb) => {
                const path = ref.path || "";
                if (path.includes('progress')) {
                    cb({ exists: () => true, data: () => ({ completedSections: [] }) });
                } else if (path.includes('messages')) {
                    cb({ docs: [] });
                } else {
                     cb({ exists: () => true, data: () => ({}) });
                }
                return () => {};
            };
            export const collection = (db, path) => ({ path });
            export const query = () => ({});
            export const where = () => ({});
            export const orderBy = () => ({});
            export const setDoc = () => Promise.resolve();
            export const updateDoc = () => Promise.resolve();
            export const arrayUnion = () => {};
            export const arrayRemove = () => {};
            export const getDocs = () => Promise.resolve({ docs: [] });
            export const serverTimestamp = () => new Date().toISOString();
            export const addDoc = () => Promise.resolve();
            """,
            content_type="application/javascript"
        ))

        # Mock Functions
        page.route("**/firebase-functions.js", lambda route: route.fulfill(
             body="""
             export const getFunctions = () => ({});
             export const connectFunctionsEmulator = () => {};
             export const httpsCallable = () => () => Promise.resolve({ data: {} });
             """,
             content_type="application/javascript"
        ))

        # Mock Storage
        page.route("**/firebase-storage.js", lambda route: route.fulfill(
             body="""
             export const getStorage = () => ({});
             export const connectStorageEmulator = () => {};
             export const ref = () => {};
             export const getDownloadURL = () => Promise.resolve('http://placeholder.url');
             export const uploadString = () => Promise.resolve();
             """,
             content_type="application/javascript"
        ))

        print("Navigating to index.html...")
        page.goto("http://localhost:3000/index.html")

        # Inject and mount component
        print("Injecting component...")
        page.evaluate("""
            Promise.all([
                import('/js/views/student/student-lesson-detail.js'),
                import('/js/utils/translation-service.js')
            ]).then(([module, tsModule]) => {
                const translationService = tsModule.translationService;
                translationService.init().then(() => {
                    const el = document.createElement('student-lesson-detail');
                    el.lessonId = 'test-lesson-1';
                    el.currentUserData = { id: 'test-user', name: 'Test Student' };
                    document.body.innerHTML = '';
                    document.body.appendChild(el);
                });
            });
        """)

        # Wait for toggle
        print("Waiting for toggle...")
        try:
            # Need to wait for getDoc to resolve and render
            page.wait_for_selector("button:has-text('Misia')", timeout=10000)
            print("Toggle found!")
        except Exception as e:
            print("Toggle NOT found (Timeout)")
            # Dump content
            print(page.content())
            page.screenshot(path="verification_failure.png")
            raise e

        # Take screenshot of Study Mode
        page.screenshot(path="verification_mission_study.png")
        print("Screenshot study mode saved.")

        # Click Mission
        print("Clicking Misia button...")
        page.click("button:has-text('Misia')")

        # Wait for Chat Panel
        print("Waiting for chat panel...")
        try:
            page.wait_for_selector("chat-panel", timeout=5000)
            print("Chat Panel found!")
        except Exception as e:
            print("Chat Panel NOT found")
            page.screenshot(path="verification_failure_mission.png")
            raise e

        # Take screenshot of Mission Mode
        page.screenshot(path="verification_mission_mode.png")
        print("Screenshot mission mode saved.")

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    run()
