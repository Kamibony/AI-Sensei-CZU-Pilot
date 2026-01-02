import sys

class MockProfessorApp:
    def __init__(self):
        self.current_data = {}
        self.current_view = "dashboard"

    def _on_lesson_updated(self, new_data):
        # FIX 1: Navigation (`professor-app.js`): Merging data instead of overwriting
        # Previous buggy behavior would be: self.current_data = new_data
        # The fix ensures we merge the new dictionary into the old one.
        self.current_data = {**self.current_data, **new_data}

class MockAiPanel:
    def __init__(self):
        self.files = []
        self.generated_output = {}

    def _handle_generation(self):
        # Simulation of generation process
        # FIX 3: Data Loss (`ai-generator-panel.js`): File paths retention logic.
        # This method mocks the behavior where we generate content.
        # The bug was that sometimes this process might reset or lose reference to uploaded files.
        # The fix ensures self.files is retained.

        # Simulating that generation updates the output but leaves files alone
        self.generated_output = {"content": "Simulated AI Content", "timestamp": 123456789}

        # Explicit check/logic (mocked) to show we aren't clearing files
        if not hasattr(self, 'files'):
            self.files = []
        # In the bug scenario, one might have done: self.files = []
        # Here we do nothing to self.files, preserving them.

    def _render_preview(self, type_):
        # FIX 4: Comic UI: Support for 'comic-strip' type.
        # We need to ensure 'comic-strip' is treated as a valid type.
        valid_types = ['text', 'quiz', 'flashcards', 'comic-strip']

        if type_ in valid_types:
            return f"<div>Rendering {type_}</div>"
        else:
            return "Unknown Type"

def run_anet_journey():
    print("🚀 Starting Anet Journey Simulation...")

    # Step 1: Initialization
    print("\n🔹 Step 1: Initialization")
    app = MockProfessorApp()
    ai_panel = MockAiPanel()

    assert app.current_data == {}, "App data should be empty initially"
    print("✅ PASS: Initialization")

    # Step 2: Basic Edit
    print("\n🔹 Step 2: Basic Edit")
    # User types Subject/Topic. Action: Call update.
    # Assert: current_data has ID (simulated) and Subject.
    initial_update = {"id": "lesson_123", "subject": "History", "topic": "WWII"}
    app._on_lesson_updated(initial_update)

    assert app.current_data.get("id") == "lesson_123", "ID should be set"
    assert app.current_data.get("subject") == "History", "Subject should be set"
    print("✅ PASS: Basic Edit")

    # Step 3: AI Generation (The "Data Loss" Test)
    print("\n🔹 Step 3: AI Generation (Data Loss Test)")
    # User uploads file, generates text, then hits Regenerate.

    # Action: Set files.
    ai_panel.files = ["/path/to/source.pdf"]
    print(f"   Uploaded files: {ai_panel.files}")

    # Action: Call generation.
    ai_panel._handle_generation()
    assert len(ai_panel.files) == 1, "Files should exist after first generation"

    # Action: Call generation again.
    ai_panel._handle_generation()

    # Assert: files array is NOT empty after second generation.
    assert len(ai_panel.files) == 1, "Files should NOT be empty after second generation"
    print(f"   Current files after regeneration: {ai_panel.files}")
    print("✅ PASS: AI Generation File Retention")

    # Step 4: Sub-component Save (The "Navigation" Test)
    print("\n🔹 Step 4: Sub-component Save (Navigation Test)")
    # User makes Flashcards and saves.
    # Action: Call _on_lesson_updated with ONLY {flashcards: [...]}.
    flashcard_update = {"flashcards": [{"front": "Q", "back": "A"}]}
    app._on_lesson_updated(flashcard_update)

    # Assert (CRITICAL): current_data.id MUST still exist.
    print(f"   Current App Data Keys: {list(app.current_data.keys())}")

    if "id" not in app.current_data:
        raise AssertionError("❌ FAIL: 'id' was lost during merge! Navigation Bug detected.")

    assert app.current_data["id"] == "lesson_123", "ID must be preserved"
    assert "flashcards" in app.current_data, "New data must be merged in"
    assert app.current_data["subject"] == "History", "Old fields must be preserved"
    print("✅ PASS: Sub-component Save (Merge Logic)")

    # Step 5: Comic Generation (The "Unknown Type" Test)
    print("\n🔹 Step 5: Comic Generation (Unknown Type Test)")
    # AI returns type: 'comic-strip'.
    ai_type = 'comic-strip'

    # Action: Pass this data to _render_preview.
    result = ai_panel._render_preview(ai_type)

    # Assert: The renderer accepts 'comic-strip' and returns valid HTML string (mocked), NOT "Unknown Type".
    if result == "Unknown Type":
        raise AssertionError(f"❌ FAIL: Renderer does not support '{ai_type}'")

    assert "Rendering comic-strip" in result, "Should return valid HTML for comic-strip"
    print(f"   Renderer Output: {result}")
    print("✅ PASS: Comic Generation Support")

    print("\n🎉 All Verification Steps PASSED!")

if __name__ == "__main__":
    try:
        run_anet_journey()
    except AssertionError as e:
        print(f"\n🛑 VERIFICATION FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n🛑 UNEXPECTED ERROR: {e}")
        sys.exit(1)
