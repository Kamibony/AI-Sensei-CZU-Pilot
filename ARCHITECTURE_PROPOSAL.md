# Architecture Proposal: Robust Real-Time State Synchronization

## 1. Problem Analysis

The current "Pointer Pattern" implementation suffers from a "Split-Brain" issue:
1.  **Dependency Chain:** The student client must successfully read the Group document (to get the ID) *and then* successfully read the Session document (to get the task).
2.  **Latency & Consistency:** There is a non-zero interval where the Group points to a Session that may not yet be fully replicated or accessible to the student's client, leading to "Invisible Tasks".
3.  **Brittleness:** Network hiccups or slight permission delays on the second read cause the UI to stall or break, even if the user is technically "in" the session.

## 2. Evaluation of Patterns

### A. The Search Pattern (Querying `active == true`)
*   **Pros:** Decoupled.
*   **Cons:** Slower (requires composite indexes). "Eventual Consistency" in queries can be slower than direct document lookups. Harder to handle "ghost" sessions (multiple active by accident).

### B. The Pointer Pattern (Current)
*   **Pros:** Single Source of Truth for *identity*.
*   **Cons:** Requires two reads. High latency vulnerability. The source of the current instability.

### C. The Subcollection Pattern (`groups/{id}/active_session/current`)
*   **Pros:** Atomic permission scoping.
*   **Cons:** Complicates analytics (requires fan-out writing to a history collection).

### D. The Recommended Solution: **The "Embedded Payload" Pattern**
We retain the "Pointer" concept for analytics referencing but **denormalize** the critical operational data (Task Description, Status) directly into the Group document.

**Why?**
*   **Zero Latency:** The moment the student knows a session exists, they also know *what* the task is.
*   **Atomic Updates:** The Professor updates the Group document in a batch. The change listener on the Student side receives the ID and the Task simultaneously.
*   **Fail-Safe:** Even if the archival `practical_sessions` document fails to create or replicate, the live session works perfectly.

## 3. The "Handshake" Protocol

### Writer (Professor)
When `createPracticalSession` is called:
1.  Create a document in `practical_sessions` (for history/grading).
2.  **Atomically** update `groups/{groupId}` with:
    *   `activeSessionId`: (Pointer to history)
    *   `activeTask`: **(The actual task text)**
    *   `sessionStatus`: `'active'` | `'ended'`
    *   `sessionStartTime`: (Timestamp)

### Reader (Student)
1.  Listen strictly to `groups/{groupId}`.
2.  **Ignore** `practical_sessions` for the initial render.
3.  If `sessionStatus == 'active'`, render `activeTask` immediately.
4.  Use `activeSessionId` *only* for tagging the submission.

### Handling "The Gap" (Milliseconds)
*   Since the data is embedded, there is no gap. The listener event contains the payload.

### Permissions
*   `groups`: Read is already open to `isSignedIn()`. This ensures students can always see the task if they can see the group.
*   `practical_sessions`: Remains open for historical reasons, but is no longer on the critical path for *viewing* the task.

### Self-Healing
*   If the client connects before data is ready: The listener waits.
*   If the data is partial (e.g., ID exists but task is empty): The UI displays "Waiting for task details..." (though atomic writes prevent this).

## 4. Implementation Plan

### Step 1: `ProfessorDataService.js` Modification
Update `createPracticalSession` to include `activeTask` and `sessionStartTime` in the `groups/{groupId}` update payload.

### Step 2: `StudentPracticeView.js` Modification
Refactor `_fetchActiveSession` to:
1.  Stop calling `_subscribeToSession` (the second listener).
2.  Render the UI directly from the `groups` snapshot data (`activeTask`, `sessionStatus`).
3.  Only use the `activeSessionId` for the file upload (submission) path.

### Step 3: Migration Safety
*   The system is backward compatible (old sessions work if we keep the pointer logic as a fallback, but for "Robust" mode we rely on the new fields).
*   We will implement a "Dual Write" on the professor side immediately.

### Step 4: Verification
*   Verify that updating a group on the Professor side instantly reflects text on the Student side without network calls to `practical_sessions`.
