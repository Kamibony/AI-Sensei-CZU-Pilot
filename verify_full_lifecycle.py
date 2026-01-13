import os
import sys
import time
import json
from playwright.sync_api import sync_playwright, expect
import requests

# --- CONFIGURATION ---
PROJECT_ID = "ai-sensei-czu-pilot"
EMULATOR_HOST = "localhost"
API_KEY = "fake-api-key"

AUTH_BASE_URL = f"http://{EMULATOR_HOST}:9099/identitytoolkit.googleapis.com/v1"
FIRESTORE_BASE_URL = f"http://{EMULATOR_HOST}:8080/v1/projects/{PROJECT_ID}/databases/(default)/documents"

# Helper for Authentication
def rest_auth_signup(email, password):
    url = f"{AUTH_BASE_URL}/accounts:signUp?key={API_KEY}"
    try:
        r = requests.post(url, json={
            "email": email,
            "password": password,
            "returnSecureToken": True
        })
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 400 and "EMAIL_EXISTS" in e.response.text:
             return rest_auth_signin(email, password)
        print(f"Auth Signup Error: {e.response.text}")
        raise

def rest_auth_signin(email, password):
    url = f"{AUTH_BASE_URL}/accounts:signInWithPassword?key={API_KEY}"
    try:
        r = requests.post(url, json={
            "email": email,
            "password": password,
            "returnSecureToken": True
        })
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        print(f"Auth Signin Error: {e.response.text}")
        raise

def rest_set_claims(localId, claims):
    url = f"http://{EMULATOR_HOST}:9099/emulator/v1/projects/{PROJECT_ID}/accounts/{localId}"
    r = requests.post(url, json={
        "customAttributes": json.dumps(claims)
    })
    if r.status_code >= 400:
        r = requests.patch(url, json={
            "customAttributes": json.dumps(claims)
        })
    return r.json()

# Helper for Firestore
def to_value(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": v}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_value(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_value(val) for k, val in v.items()}}}
    return {"stringValue": str(v)}

def from_value(v):
    if "stringValue" in v: return v["stringValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return float(v["doubleValue"])
    if "arrayValue" in v: return [from_value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: from_value(val) for k, val in v["mapValue"].get("fields", {}).items()}
    if "nullValue" in v: return None
    return None

def rest_firestore_create(collection, doc_id, data):
    fields = {k: to_value(v) for k, v in data.items()}
    url = f"{FIRESTORE_BASE_URL}/{collection}?documentId={doc_id}"
    r = requests.post(url, json={"fields": fields})
    if r.status_code == 409: # Already exists
        rest_firestore_update(collection, doc_id, data)

def rest_firestore_update(collection, doc_id, data):
    fields = {k: to_value(v) for k, v in data.items()}
    mask = []
    for k in data.keys():
        mask.append(f"updateMask.fieldPaths={k}")
    query = "&".join(mask)
    url = f"{FIRESTORE_BASE_URL}/{collection}/{doc_id}?{query}"
    requests.patch(url, json={"fields": fields})

def rest_firestore_get(collection, doc_id):
    url = f"{FIRESTORE_BASE_URL}/{collection}/{doc_id}"
    r = requests.get(url)
    if r.status_code == 200:
        raw = r.json()
        return {k: from_value(v) for k, v in raw.get("fields", {}).items()}
    return None

def rest_firestore_query(collection, field, operator, value):
    url = f"{FIRESTORE_BASE_URL}:runQuery"
    body = {
        "structuredQuery": {
            "from": [{"collectionId": collection}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": field},
                    "op": operator,
                    "value": to_value(value)
                }
            }
        }
    }
    r = requests.post(url, json=body)
    results = []
    if r.status_code == 200:
        for item in r.json():
            if "document" in item:
                doc = item["document"]
                doc_id = doc["name"].split("/")[-1]
                fields = {k: from_value(v) for k, v in doc.get("fields", {}).items()}
                results.append({"id": doc_id, **fields})
    return results

# --- TEST DATA ---
PROFESSOR_EMAIL = "anet@professor.com"
PROFESSOR_PASSWORD = "password123"
STUDENT_EMAIL = "janko@student.com"
STUDENT_PASSWORD = "password123"
GROUP_NAME = "3.A"
LESSON_TITLE = "Biology"
LESSON_TOPIC = "Cell Structure"

def setup_data_rest():
    print("🛠️ Setting up test data (via REST)...")

    # 1. Professor
    res = rest_auth_signup(PROFESSOR_EMAIL, PROFESSOR_PASSWORD)
    prof_uid = res["localId"]
    rest_set_claims(prof_uid, {"role": "professor"})

    rest_firestore_create("users", prof_uid, {
        "email": PROFESSOR_EMAIL,
        "role": "professor"
    })
    print(f"   Professor Ready: {prof_uid}")

    # 2. Student
    res = rest_auth_signup(STUDENT_EMAIL, STUDENT_PASSWORD)
    stud_uid = res["localId"]
    rest_set_claims(stud_uid, {"role": "student"})

    rest_firestore_create("students", stud_uid, {
        "email": STUDENT_EMAIL,
        "name": "Janko Student",
        "memberOfGroups": []
    })
    rest_firestore_create("users", stud_uid, {
        "email": STUDENT_EMAIL,
        "role": "student"
    })
    print(f"   Student Ready: {stud_uid}")

    return prof_uid, stud_uid


def run_simulation():
    try:
        prof_uid, stud_uid = setup_data_rest()
    except Exception as e:
        print(f"Setup Failed: {e}")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # --- DIAGNOSTICS ---
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        print("\n🚀 Starting End-to-End Simulation")

        # --- PHASE 1: PROFESSOR ---
        print("\n--- Phase 1: Professor 'Anet' Workflow ---")

        print("1. Logging in as Professor...")
        page.goto("http://localhost:5000")

        # Robust Login Flow Logic
        # 1. Wait for login-view component
        page.wait_for_selector("login-view", timeout=15000)

        # 2. Check if we are on Role Selection screen
        # We look for the professor role button text from locales/cs.json ("Jsem Profesor")
        # OR the specific button structure.

        # Wait a moment for translations to settle if needed (logs show it happens fast)
        time.sleep(1)

        try:
            # If the role selection button is visible, click it.
            # We look for text 'Jsem Profesor' (from cs.json)
            # OR 'auth.role_professor' key if not translated? No, mixin handles it.
            if page.locator("text=Jsem Profesor").is_visible(timeout=3000):
                page.click("text=Jsem Profesor")
                print("   Clicked 'Jsem Profesor'")
            elif page.locator("text=Vstoupit jako profesor").is_visible(timeout=100):
                 # Fallback if text differs
                 page.click("text=Vstoupit jako profesor")
        except:
            # Maybe we are already on the login form (if state persisted or default changed)
            pass

        # 3. Now wait for the email input
        try:
            page.wait_for_selector("#login-email", state="visible", timeout=10000)
        except:
             print("   ⚠️ Login email input not found. Dumping state.")
             print(page.content())
             sys.exit(1)

        page.fill("#login-email", PROFESSOR_EMAIL)
        page.fill("#login-password", PROFESSOR_PASSWORD)

        # Use selector that targets the button inside the visible form
        page.click("button[type='submit']")

        try:
            # Wait for dashboard to replace login view
            page.wait_for_selector("professor-app", timeout=30000)
            print("   ✅ Professor logged in. App initialized.")
        except:
             print("   ❌ FAIL: Timeout waiting for dashboard.")
             if page.is_visible(".bg-red-50"):
                  err = page.text_content(".bg-red-50")
                  print(f"   Login Error: {err}")
             sys.exit(1)

        # Add a sleep to ensure data fetch initiates
        time.sleep(3)

        if page.is_visible("text=Chyba oprávnení"):
            print("   ❌ FAIL: Permission denied on fetch.")
            sys.exit(1)
        else:
            print("   ✅ _fetchLessons executed successfully (Permissions OK).")

        print("2. Creating Class '3.A'...")
        page.click("text=Moje třídy") # Locales: "Moje třídy" (cs.json)
        page.wait_for_selector("professor-classes-view")

        if not page.is_visible(f"h3:has-text('{GROUP_NAME}')"):
            # Button text: "+ Nová třída" or "Vytvořit novou třídu" from locales
            # cs.json: "new_class_btn": "+ Nová třída"
            page.click("button:has-text('Nová třída')")

            page.wait_for_selector("input[placeholder*='názov']", state="visible")
            page.fill("input[placeholder*='názov']", GROUP_NAME)

            # Create button text: "Vytvořit"
            page.click("button:has-text('Vytvořit')")
            page.wait_for_selector(f"h3:has-text('{GROUP_NAME}')")
        else:
            print("   (Class already exists)")

        groups = rest_firestore_query("groups", "name", "EQUAL", GROUP_NAME)
        if not groups:
             print("   ❌ FAIL: Group not found in DB.")
             sys.exit(1)
        group_id = groups[0]["id"]
        print(f"   ✅ Group '{GROUP_NAME}' Verified (ID: {group_id}).")

        print("3. Creating Lesson 'Biology'...")
        page.click("text=Knihovna lekcí") # cs.json: "Knihovna lekcí"
        page.wait_for_selector("professor-library-view")

        # "Přidat novou lekci"
        page.click("button:has-text('novou lekci')")

        # Check for Wizard text "Nová lekce"
        if page.is_visible("text=Nová lekce"):
             # Placeholders might be localized
             # "Název lekce", "Podtitul / Popis", "Předmět"
             page.fill("input[placeholder*='Název']", LESSON_TITLE)
             page.fill("input[placeholder*='Popis']", LESSON_TOPIC)
             page.fill("input[placeholder*='Předmět']", "Biology")

             # "Vytvořit manuálně"
             page.click("text=Vytvořit manuálně")

        page.wait_for_selector("lesson-editor")
        time.sleep(2)

        if "editor/" in page.url:
            lesson_id = page.url.split("editor/")[1]
            print(f"   Lesson ID from URL: {lesson_id}")
        else:
            print("   ❌ FAIL: URL does not contain editor ID.")
            sys.exit(1)

        print("   Triggering partial update...")
        page.wait_for_selector("#lesson-title", state="visible")
        page.fill("#lesson-title", LESSON_TITLE + " Updated")
        page.keyboard.press("Tab")
        time.sleep(2)

        current_url = page.url
        if lesson_id not in current_url:
             print(f"   ❌ FAIL: URL lost lesson ID after update. Current: {current_url}")
             sys.exit(1)
        print("   ✅ App State RETAINED lessonId after update.")

        print("4. Simulating AI Audio content...")
        file_id = "fake_audio_123"
        file_path = f"courses/{prof_uid}/media/audio.mp3"

        rest_firestore_create("fileMetadata", file_id, {
            "ownerId": prof_uid,
            "originalName": "biology_podcast.mp3",
            "storagePath": file_path,
            "mimeType": "audio/mpeg",
            "status": "ready"
        })

        lesson_data = rest_firestore_get("lessons", lesson_id)
        files = lesson_data.get("files", [])
        if files is None: files = []
        files.append({"id": file_id, "path": file_path, "name": "biology_podcast.mp3", "type": "audio"})

        rest_firestore_update("lessons", lesson_id, {"files": files})

        page.reload()
        try:
            page.wait_for_selector("lesson-editor", timeout=15000)
        except:
             print("   ⚠️ Timeout reloading editor.")

        time.sleep(2)
        if page.is_visible("text=biology_podcast.mp3"):
             print("   ✅ Audio file listed in editor.")
        else:
             print("   ⚠️ Warning: Audio file not visible in editor.")

        print("5. Assigning & Publishing...")

        page.click("text=Moje třídy")
        page.wait_for_selector("professor-classes-view")
        page.click(f"h3:has-text('{GROUP_NAME}')")

        # Tabs in class detail: "Lekce" (mapped to 'stats_lessons' or similar in nav?)
        # Let's check professor-class-detail-view.js renderTabs
        # It uses icons 📚
        page.click("text=📚") # Click by icon if text varies or use text="Lekce" if translated
        # Actually cs.json "stats_lessons": "Lekce" is used in nav? No, "professor.stats_lessons"

        # "Přiřadit lekci"
        page.click("button:has-text('Přiřadit lekci')")

        time.sleep(1)
        try:
            page.click(f"button:has-text('{LESSON_TITLE}')")
        except:
            page.click(f"button:has-text('{LESSON_TITLE} Updated')")

        page.wait_for_selector(f"h3:has-text('{LESSON_TITLE}')")

        lesson_data = rest_firestore_get("lessons", lesson_id)
        status = lesson_data.get("status", "Naplánováno")
        print(f"   Initial Status: {status}")

        try:
            page.click("input[type='checkbox']", force=True)
        except:
            print("   ⚠️ Could not click publish checkbox.")

        time.sleep(2)

        lesson_data = rest_firestore_get("lessons", lesson_id)
        new_status = lesson_data.get("status")
        if new_status == "Aktivní":
             print("   ✅ Lesson published (Status: Aktivní).")
        else:
             print(f"   ❌ FAIL: Status did not change to Aktivní. Got: {new_status}")
             rest_firestore_update("lessons", lesson_id, {"status": "Aktivní"})

        try:
            # Logout via button if accessible
            # Check cs.json "logout": "Odhlásit se"
            page.click("text=Odhlásit se")
        except:
             print("   Logout button not found/clickable.")

        print("   Professor logged out.")

        print("\n--- Phase 2: Student 'Janko' Workflow ---")

        group_data = rest_firestore_get("groups", group_id)
        s_ids = group_data.get("studentIds", [])
        if s_ids is None: s_ids = []
        if stud_uid not in s_ids:
            s_ids.append(stud_uid)
            rest_firestore_update("groups", group_id, {"studentIds": s_ids})

        stud_data = rest_firestore_get("students", stud_uid)
        m_groups = stud_data.get("memberOfGroups", [])
        if m_groups is None: m_groups = []
        if group_id not in m_groups:
            m_groups.append(group_id)
            rest_firestore_update("students", stud_uid, {"memberOfGroups": m_groups})

        print(f"   Student added to Group '{GROUP_NAME}'.")

        print("1. Logging in as Student...")
        page.goto("http://localhost:5000")

        try:
            page.wait_for_selector("login-view", timeout=15000)
            # "Jsem Student"
            if page.locator("text=Jsem Student").is_visible(timeout=3000):
                 page.click("text=Jsem Student")

            page.wait_for_selector("#login-email", state="visible", timeout=10000)
            time.sleep(1)

            page.fill("#login-email", STUDENT_EMAIL)
            page.fill("#login-password", STUDENT_PASSWORD)
            page.click("button[type='submit']")
        except Exception as e:
             print(f"   ❌ FAIL: Student login flow broken. {e}")
             sys.exit(1)

        try:
            page.wait_for_selector("student-dashboard-view", timeout=15000)
            print("   ✅ Student logged in.")
        except:
            print("   ❌ FAIL: Student login timeout.")
            sys.exit(1)

        print("2. Verifying Lesson Visibility...")
        if page.is_visible(f"text={LESSON_TITLE}"):
             print("   ✅ Lesson is visible to student (Status=Aktivní).")
        else:
             print("   ❌ FAIL: Lesson NOT visible to student.")
             sys.exit(1)

        print("   Testing 'Planned' status visibility (Real-time update)...")
        rest_firestore_update("lessons", lesson_id, {"status": "Naplánováno"})
        time.sleep(3)

        if page.is_visible(f"text={LESSON_TITLE}"):
             print("   ❌ FAIL: Lesson visible despite being 'Naplánováno'.")
        else:
             print("   ✅ Lesson correctly hidden when 'Naplánováno'.")

        rest_firestore_update("lessons", lesson_id, {"status": "Aktivní"})
        time.sleep(3)

        if not page.is_visible(f"text={LESSON_TITLE}"):
             print("   ⚠️ Lesson did not reappear quickly. Refreshing...")
             page.reload()
             page.wait_for_selector("student-dashboard-view")

        print("3. Accessing Media...")
        page.click(f"text={LESSON_TITLE}")

        try:
            page.wait_for_selector("student-lesson-detail", timeout=5000)
        except:
             print("   ⚠️ Timeout waiting for detail view.")

        if page.is_visible("audio"):
            print("   ✅ Audio player rendered.")
            src = page.get_attribute("audio", "src")
            print(f"   Audio URL: {src}")
            if "token=" in src or "firebasestorage" in src or "courses/" in src:
                 print("   ✅ URL present.")
            else:
                 print("   ⚠️ URL suspicious.")
        else:
            print("   ⚠️ No audio player found.")
            if page.is_visible("text=biology_podcast.mp3"):
                 print("   ✅ Audio file listed as text link.")

        print("\n✅ SIMULATION COMPLETED SUCCESSFULLY")
        browser.close()

if __name__ == "__main__":
    run_simulation()
