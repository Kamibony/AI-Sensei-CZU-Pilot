
import os
import time
from playwright.sync_api import sync_playwright, expect

def test_professor_chat(page):
    # 1. Load the page
    page.goto("http://127.0.0.1:5000/")

    print("Starting Setup...")

    # 2. Login as Professor to get UID and create a Group
    print("Logging in as Professor to create Group...")
    page.evaluate("""async () => {
        const { auth, db } = await import('/js/firebase-init.js');
        const { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

        const email = 'profesor@profesor.cz';
        const password = 'password123';

        try {
            await signOut(auth);
            let userCredential;
            try {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } catch (e) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    email: email,
                    role: 'professor',
                    createdAt: new Date()
                });
            }

            const profUid = userCredential.user.uid;

            // Create a Group owned by this professor
            // Rules: allow create if ownerId == auth.uid
            await setDoc(doc(db, 'groups', 'test-group-id'), {
                name: 'Test Class',
                ownerId: profUid,
                studentIds: [] // Can be empty for now, logic uses student's memberOfGroups
            });
            console.log("Created Group 'test-group-id' for Professor UID:", profUid);

            await signOut(auth);

        } catch (error) {
            console.error("Professor Setup Error:", error);
            throw error;
        }
    }""")

    # 3. Login as Student to create Student Doc with Membership
    print("Logging in as Student to create User Doc with Membership...")
    page.evaluate("""async () => {
        const { auth, db } = await import('/js/firebase-init.js');
        const { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

        const studentEmail = 'student.chat.verify@test.com';
        const password = 'password123';

        try {
            await signOut(auth);
            let userCredential;
            try {
                userCredential = await signInWithEmailAndPassword(auth, studentEmail, password);
            } catch (e) {
                userCredential = await createUserWithEmailAndPassword(auth, studentEmail, password);
            }

            const uid = userCredential.user.uid;

            // Create/Update the student document
            // IMPORTANT: Add 'test-group-id' to memberOfGroups so the professor can see them
            await setDoc(doc(db, 'students', uid), {
                name: 'Test Student For Chat',
                email: studentEmail,
                memberOfGroups: ['test-group-id'],
                telegramChatId: null
            });
            console.log("Created Student Doc for UID:", uid, "with membership in test-group-id");

            await signOut(auth);

        } catch (error) {
            console.error("Student Setup Error:", error);
            throw error;
        }
    }""")

    # 4. Final Login as Professor to run the test
    print("Final Login as Professor...")
    page.evaluate("""async () => {
        const { auth } = await import('/js/firebase-init.js');
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        await signInWithEmailAndPassword(auth, 'profesor@profesor.cz', 'password123');
    }""")

    page.reload()

    # Wait for dashboard
    try:
        expect(page.locator("#dashboard-professor")).to_be_visible(timeout=30000)
        print("Successfully reached Professor Dashboard")
    except:
        print("Dashboard not found.")
        page.screenshot(path="verification/dashboard_fail_2.png")
        raise Exception("Failed to reach dashboard")

    # 5. Open Student List
    page.click("button[data-view='students']")
    expect(page.locator("professor-students-view")).to_be_visible(timeout=10000)

    # Wait for list to populate
    print("Waiting for student list to populate...")
    page.wait_for_timeout(3000) # Give Firestore time to sync

    student_rows = page.locator("professor-students-view .grid > div") # Updated locator for student card
    count = student_rows.count()
    print(f"Found {count} students.")

    if count == 0:
         print("ERROR: No students found.")
         page.screenshot(path="verification/no_students_2.png")
         return

    # 6. Open Student Profile
    print(f"Opening student profile...")
    student_rows.first.click()
    expect(page.locator("professor-student-profile-view")).to_be_visible(timeout=10000)

    # 7. Click Chat Tab
    print("Looking for Chat tab...")
    chat_tab = page.get_by_role("button", name="💬 Chat")
    expect(chat_tab).to_be_visible()
    chat_tab.click()

    # 8. Verify Chat Interface
    expect(page.locator("h3:has-text('Chat se studentem')")).to_be_visible()

    # 9. Send a message
    msg_text = f"Hello Student {time.time()}"
    page.fill("#chat-input", msg_text)
    page.click("text=Odeslat")

    # 10. Verify message appears
    print("Verifying message appeared...")
    expect(page.locator(f"text={msg_text}")).to_be_visible(timeout=10000)

    page.screenshot(path="verification/success_chat.png")
    print("Chat verification PASSED")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"BROWSER: {msg.text}"))
        try:
            test_professor_chat(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
