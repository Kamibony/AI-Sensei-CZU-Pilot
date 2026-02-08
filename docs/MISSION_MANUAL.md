# User Manual (v1.0): AI Sensei "Mission Mode"

## PART 1: The Professor's Workflow (Authoring & Controlling)

### 1. Creating the Mission Structure
The Mission architecture is **AI-generated** based on your course materials. There is currently no manual drag-and-drop editor for nodes.

1.  **Access the Mission Editor:**
    *   Navigate to the **Lesson Editor** (`Editor lekcí`).
    *   Select the **Mission** tab (Rocket icon 🚀) from the tool list.
2.  **Upload & Analyze:**
    *   Ensure PDF files are uploaded in the "Files" section on the left.
    *   Click the **Analyzovat & Generovat** button.
    *   The AI will process the documents and automatically generate:
        *   **Knowledge Graph:** A visual network of concepts (Nodes) and their relationships.
        *   **Roles:** Student roles (e.g., "Analyst", "Commander") with secret objectives.
        *   **Milestones:** A sequence of project phases and potential crises.
3.  **Launch:**
    *   Review the generated structure.
    *   Click **Uložit a Spustit Misi** (`🚀 Save & Launch`) to activate the mission for students.

### 2. Triggering the Event (The Game Master Role)
Once the mission is active, the editor switches to **Mission Control** mode.

1.  **Monitor Status:**
    *   The dashboard displays the "Project Phases" and "Active Roles".
    *   An **AI Observer** panel provides real-time supervision.
2.  **Activate a Crisis:**
    *   Locate the **Crisis Scenarios** (`Krizové scénáře`) section in the control panel.
    *   Identify a milestone to test (e.g., "Phase 2: Execution").
    *   Click the **⚠ Spustit krizi** button next to the desired milestone.
    *   **Effect:** This immediately updates the `activeCrisis` field in the database, triggering the red alert state on all student dashboards.
3.  **Resolve the Crisis:**
    *   Monitor student progress in the chat or Observer.
    *   When satisfied with their response, click the **Vyřešit krizi** button in the "Crisis Active" banner to return the system to a normal state.

---

## PART 2: The Student's Workflow (The Operator)

### 1. Entering the Simulation
*   **Access:** Open the lesson and toggle the view switch from "Studovna" (Study) to **Mise** (Mission).
*   **Idle State (Green):**
    *   **Left Panel:** Displays your assigned **Role** (e.g., "COMMANDER") and **Secret Objective**.
    *   **Right Panel (Status):** Shows a green checkmark icon with the text **SYSTEM NOMINAL**.
    *   **Center:** The **Mission Comms** terminal is active but quiet.

### 2. The Crisis Event (Reaction)
When the Professor triggers a crisis:

*   **Visual Alarm:** The dashboard border turns red and begins pulsing (`animate-pulse-border`).
*   **Status Update:** The Right Panel turns red (`bg-red-900`) and displays:
    *   **Badge:** `⚠️ KRIZE AKTIVNÍ`
    *   **Title:** The specific crisis title (e.g., "Server Breach").
    *   **Description:** A briefing of the situation.
    *   **Action Required:** A black alert box appears with the text: **"⚠️ Použijte chat k vyřešení situace!"**

### 3. Resolution (The Gameplay)
*   **Tool:** Use the **Mission Comms** chat interface in the center of the screen.
*   **Interaction:**
    *   Type commands or responses in the input field: **"Zadejte příkaz..."**.
    *   Press **Enter** or click the **Arrow Icon** to send.
*   **System Response:**
    *   The "HQ" (AI Game Master) will reply in character, providing updates, asking for decisions, or confirming the success of your actions.
    *   *Note:* The crisis state (Red Screen) persists until the **Professor** manually resolves it via their Mission Control dashboard.
