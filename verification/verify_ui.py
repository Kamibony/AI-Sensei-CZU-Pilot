from playwright.sync_api import sync_playwright
import time

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Verify Professor View
        print('Verifying Professor View...')
        page = browser.new_page()
        page.goto('http://localhost:8080/test_verification_professor.html')
        page.wait_for_selector('practice-view')
        time.sleep(2)
        page.screenshot(path='verification/professor_view.png', full_page=True)
        print('Captured professor_view.png')

        # 2. Verify Student View (Pass)
        print('Verifying Student View (Pass)...')
        page_pass = browser.new_page()
        page_pass.goto('http://localhost:8080/test_verification_student_pass.html')
        page_pass.wait_for_selector('student-practice-view')
        time.sleep(2)
        page_pass.screenshot(path='verification/student_pass.png', full_page=True)
        print('Captured student_pass.png')

        # 3. Verify Student View (Fail)
        print('Verifying Student View (Fail)...')
        page_fail = browser.new_page()
        page_fail.goto('http://localhost:8080/test_verification_student_fail.html')
        page_fail.wait_for_selector('student-practice-view')
        time.sleep(2)
        page_fail.screenshot(path='verification/student_fail.png', full_page=True)
        print('Captured student_fail.png')

        browser.close()

if __name__ == '__main__':
    verify_ui()
