import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, storage } from "../../firebase-init.js";

export class StudentPracticeView extends LitElement {
    static properties = {
        activeSession: { type: Object },
        submission: { type: Object },
        isUploading: { type: Boolean },
        uploadError: { type: String }
    };

    static styles = css`
        :host {
            display: block;
            padding: 16px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 24px;
            text-align: center;
        }
        .task-box {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            font-size: 1.25rem;
            font-weight: 500;
            color: #0369a1;
        }
        .btn-upload {
            background: #2563eb;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 1rem;
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-upload:disabled {
            background: #94a3b8;
            cursor: not-allowed;
        }
        input[type="file"] {
            display: none;
        }
        .feedback-card {
            border: 1px solid #e2e8f0;
            padding: 16px;
            border-radius: 8px;
            margin-top: 16px;
            text-align: left;
        }
        .grade {
            font-size: 2rem;
            font-weight: bold;
            color: #2563eb;
            text-align: center;
            margin-bottom: 12px;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 99px;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 12px;
        }
        .status-evaluating {
            background: #fefce8;
            color: #854d0e;
        }
        .status-done {
            background: #f0fdf4;
            color: #166534;
        }
        .preview-image {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin-top: 16px;
            max-height: 300px;
        }
    `;

    constructor() {
        super();
        this.activeSession = null;
        this.submission = null;
        this.isUploading = false;
        this.uploadError = null;
        this._unsubscribeSession = null;
        this._unsubscribeSubmission = null;
    }

    async firstUpdated() {
        await this._fetchActiveSession();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeSession) this._unsubscribeSession();
        if (this._unsubscribeSubmission) this._unsubscribeSubmission();
    }

    async _fetchActiveSession() {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const studentRef = doc(db, 'students', user.uid);
            const studentSnap = await getDoc(studentRef);
            if (!studentSnap.exists()) return;

            const groupIds = studentSnap.data().memberOfGroups || [];
            if (groupIds.length === 0) return;

            // Limit to 10 for 'in' query
            const q = query(
                collection(db, 'practical_sessions'),
                where('groupId', 'in', groupIds.slice(0, 10)),
                where('status', '==', 'active')
            );

            this._unsubscribeSession = onSnapshot(q, (snapshot) => {
                 if (!snapshot.empty) {
                     // Sort by start time locally if needed, or just pick first
                     const doc = snapshot.docs[0];
                     this.activeSession = { id: doc.id, ...doc.data() };
                     this._checkSubmission(this.activeSession.id);
                 } else {
                     this.activeSession = null;
                     this.submission = null;
                 }
            });
        } catch (e) {
            console.error("Error fetching session:", e);
        }
    }

    _checkSubmission(sessionId) {
        if (this._unsubscribeSubmission) this._unsubscribeSubmission();
        const user = auth.currentUser;
        if (!user) return;

        const q = query(
            collection(db, 'practical_submissions'),
            where('sessionId', '==', sessionId),
            where('studentId', '==', user.uid)
        );

        this._unsubscribeSubmission = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                this.submission = { id: doc.id, ...doc.data() };
            } else {
                this.submission = null;
            }
        });
    }

    async _handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.isUploading = true;
        this.uploadError = null;

        try {
            const user = auth.currentUser;
            // 1. Upload to Storage
            // Path: courses/{userId}/practical_submissions/{sessionId}/{filename}
            // Note: Cloud Function reads from storagePath.
            // Using student's ID folder or a shared one?
            // "courses/{ownerId}/..." structure is for professors.
            // Students probably should upload to "students/{studentId}/..." or generic "practical_uploads/...".
            // Let's use `practical_uploads/${sessionId}/${studentId}_${timestamp}.jpg`

            const timestamp = Date.now();
            const storagePath = `practical_uploads/${this.activeSession.id}/${user.uid}_${timestamp}.jpg`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file);

            // 2. Create Submission Record
            await addDoc(collection(db, 'practical_submissions'), {
                sessionId: this.activeSession.id,
                studentId: user.uid,
                storagePath: storagePath,
                submittedAt: serverTimestamp(),
                status: 'pending' // Cloud function will pick this up
            });

        } catch (error) {
            console.error("Upload failed:", error);
            this.uploadError = "Nepodařilo se nahrát fotografii. Zkuste to prosím znovu.";
        } finally {
            this.isUploading = false;
        }
    }

    render() {
        if (!this.activeSession) {
            return html`
                <div class="container">
                    <div class="card">
                        <h2 class="text-xl">Žádný aktivní výcvik</h2>
                        <p class="text-gray-500 mt-2">V tuto chvíli neprobíhá žádný odborný výcvik.</p>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="container">
                <div class="card">
                    <h1 class="text-2xl font-bold mb-4">Odborný Výcvik</h1>

                    <div class="task-box">
                        ${this.activeSession.activeTask || "Čekejte na zadání úkolu..."}
                    </div>

                    ${this.submission ? this._renderSubmissionStatus() : this._renderUploadForm()}
                </div>
            </div>
        `;
    }

    _renderUploadForm() {
        return html`
            <div class="mt-8">
                <input
                    type="file"
                    id="cameraInput"
                    accept="image/*"
                    capture="environment"
                    @change="${this._handleFileUpload}"
                >
                <button
                    class="btn-upload"
                    ?disabled="${this.isUploading || !this.activeSession.activeTask}"
                    @click="${() => this.shadowRoot.getElementById('cameraInput').click()}"
                >
                    ${this.isUploading ? 'Nahrávám...' : html`
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        Vyfotit splněný úkol
                    `}
                </button>
                ${this.uploadError ? html`<p class="text-red-500 mt-2">${this.uploadError}</p>` : ''}
            </div>
        `;
    }

    _renderSubmissionStatus() {
        const s = this.submission;
        let badgeClass = s.status === 'evaluated' ? 'status-done' : 'status-evaluating';
        let badgeText = s.status === 'evaluated' ? 'Hodnoceno' : s.status === 'error' ? 'Chyba' : 'AI hodnotí...';
        if (s.status === 'error') badgeClass = 'bg-red-100 text-red-800';

        return html`
            <div class="mt-6">
                <span class="status-badge ${badgeClass}">${badgeText}</span>

                ${s.status === 'evaluated' ? html`
                    <div class="grade">${s.grade}</div>
                    <div class="feedback-card">
                        <h3 class="font-bold mb-2">Hodnocení AI:</h3>
                        <p class="text-gray-700 whitespace-pre-wrap">${s.feedback}</p>
                    </div>
                ` : s.status === 'error' ? html`
                    <p class="text-red-500">${s.error}</p>
                    <button class="btn-upload mt-4" @click="${this._handleRetry}">Zkusit znovu</button>
                ` : html`
                    <p class="text-gray-500 animate-pulse">Analyzuji vaši práci, chvilku strpení...</p>
                `}
            </div>
        `;
    }

    async _handleRetry() {
        // Delete submission to allow retry? Or update existing?
        // Updating existing might trigger cloud function again if configured onUpdate, but mine is onDocumentCreated.
        // So I should delete and re-create.
        if (this.submission) {
            try {
                // Warning: Security rules might prevent delete.
                // Assuming students can delete their own pending/error submissions.
                // If not, we just reset local state and allow upload (creating new doc).
                // Ideally backend handles clean up.
                // For now, let's try to delete.
                await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(m => m.deleteDoc(doc(db, 'practical_submissions', this.submission.id)));
            } catch (e) {
                console.error("Delete failed", e);
            }
        }
    }
}
customElements.define('student-practice-view', StudentPracticeView);
