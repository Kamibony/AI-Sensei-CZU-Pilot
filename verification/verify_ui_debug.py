from playwright.sync_api import sync_playwright
import time

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Verify Professor View
        print('Verifying Professor View...')
        page = browser.new_page()
        page.on('console', lambda msg: print(f'CONSOLE: {msg.text}'))
        page.on('pageerror', lambda exc: print(f'PAGE ERROR: {exc}'))
        page.goto('http://localhost:8080/test_verification_professor.html')

        try:
            page.wait_for_selector('practice-view', state='attached', timeout=5000)
            time.sleep(2)
            page.screenshot(path='verification/professor_view.png', full_page=True)
            print('Captured professor_view.png')
        except Exception as e:
            print(f'Failed professor view: {e}')

        # 2. Verify Student View (Pass)
        print('Verifying Student View (Pass)...')
        page_pass = browser.new_page()
        page_pass.on('console', lambda msg: print(f'CONSOLE: {msg.text}'))
        page_pass.on('pageerror', lambda exc: print(f'PAGE ERROR: {exc}'))
        page_pass.goto('http://localhost:8080/test_verification_student_pass.html')
        try:
            page_pass.wait_for_selector('student-practice-view', state='attached', timeout=5000)
            time.sleep(2)
            page_pass.screenshot(path='verification/student_pass.png', full_page=True)
            print('Captured student_pass.png')
        except Exception as e:
            print(f'Failed student pass view: {e}')

        browser.close()

if __name__ == '__main__':
    verify_ui()
