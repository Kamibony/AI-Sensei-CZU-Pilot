import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, doc, getDoc, updateDoc, arrayUnion, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, storage } from "../../firebase-init.js";

export class StudentPracticeView extends LitElement {
    static properties = {
        activeSession: { type: Object },
        submission: { type: Object },
        isUploading: { type: Boolean },
        uploadError: { type: String },
        hasNoGroups: { type: Boolean },
        isAutoJoining: { type: Boolean }
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
        this.hasNoGroups = false;
        this.isAutoJoining = false;
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

    async _fetchActiveSession(injectedGroups = null) {
        const user = auth.currentUser;
        if (!user) return;

        try {
            // 1. Fetch user profile to get memberOfGroups
            let groups = injectedGroups;
            const userDocRef = doc(db, 'users', user.uid);

            if (!groups) {
                const userDoc = await getDoc(userDocRef);
                groups = userDoc.exists() ? (userDoc.data().memberOfGroups || []) : [];
            }

            if (groups.length === 0) {
                // Auto-Enrollment Fallback
                this.isAutoJoining = true;
                try {
                    const qAny = query(
                        collection(db, 'practical_sessions'),
                        where('status', '==', 'active'),
                        orderBy('startTime', 'desc'),
                        limit(1)
                    );
                    const snapshot = await getDocs(qAny);

                    if (!snapshot.empty) {
                        const sessionData = snapshot.docs[0].data();
                        if (sessionData.groupId) {
                            try {
                                await updateDoc(userDocRef, {
                                    memberOfGroups: arrayUnion(sessionData.groupId)
                                });
                            } catch (err) {
                                // Self-Healing Strategy: Recovery for Ghost Users
                                if (err.code === 'not-found') {
                                    console.warn("Ghost User detected. Initiating profile recovery...");
                                    await setDoc(userDocRef, {
                                        email: user.email,
                                        role: 'student',
                                        memberOfGroups: [sessionData.groupId],
                                        createdAt: serverTimestamp(),
                                        updatedAt: serverTimestamp()
                                    });
                                } else {
                                    throw err; // Re-throw other errors to be handled by outer catch
                                }
                            }

                            this.isAutoJoining = false;
                            return this._fetchActiveSession([sessionData.groupId]);
                        }
                    }
                } catch (e) {
                    console.error("Auto-enrollment failed:", e);
                }

                this.isAutoJoining = false;
                this.hasNoGroups = true;
                this.activeSession = null;
                this.submission = null;
                return;
            }
            this.hasNoGroups = false;

            // 2. Query for active sessions in user's groups
            // Note: Firestore limits 'in' queries to 30 items.
            // Assuming student is not in >30 groups. If so, we'd need to batch or just take first 30.
            const searchGroups = groups.slice(0, 30);

            const q = query(
                collection(db, 'practical_sessions'),
                where('groupId', 'in', searchGroups),
                where('status', '==', 'active'),
                orderBy('startTime', 'desc'),
                limit(1)
            );

            this._unsubscribeSession = onSnapshot(q, (snapshot) => {
                 if (!snapshot.empty) {
                     const doc = snapshot.docs[0];
                     console.log(`%c[Tracepoint C] Receiver Layer: Received Snapshot ID: ${doc.id}`, "color: green; font-weight: bold", { content: doc.data() });
                     this.activeSession = { id: doc.id, ...doc.data() };
                     this._checkSubmission(this.activeSession.id);
                 } else {
                     console.log(`%c[Tracepoint C] Receiver Layer: Snapshot Empty`, "color: green; font-weight: bold");
                     this.activeSession = null;
                     this.submission = null;
                 }
            });
        } catch (e) {
            console.error("Error fetching session:", e);
            // Fallback?
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

    async _compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1024;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Canvas toBlob failed"));
                        }
                    }, 'image/jpeg', 0.7);
                };
                img.onerror = (e) => reject(e);
            };
            reader.onerror = (e) => reject(e);
        });
    }

    async _handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.isUploading = true;
        this.uploadError = null;
        let fileToUpload = file;

        try {
            // 1. Image Compression Middleware
            try {
                fileToUpload = await this._compressImage(file);
            } catch (compressionError) {
                console.warn("Image compression failed, proceeding with original file:", compressionError);
            }

            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated");

            // 2. Upload to Storage
            const timestamp = Date.now();
            const storagePath = `practical_uploads/${this.activeSession.id}/${user.uid}_${timestamp}.jpg`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, fileToUpload);

            // 3. Create Submission Record
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
        if (this.isAutoJoining) {
            return html`
                <div class="container">
                    <div class="card">
                        <h2 class="text-xl animate-pulse">Automatické pripájanie k triede...</h2>
                        <p class="text-gray-500 mt-2">Prosím čakajte, hľadáme aktívnu lekciu.</p>
                    </div>
                </div>
            `;
        }

        if (this.hasNoGroups) {
             return html`
                <div class="container">
                    <div class="card">
                        <h2 class="text-xl">Žádná třída</h2>
                        <p class="text-gray-500 mt-2">Nie ste zaradený do žiadnej triedy. Kontaktujte učiteľa.</p>
                    </div>
                </div>
            `;
        }

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
                    <p class="text-gray-500 animate-pulse">🤖 AI Majster analyzuje tvoju prácu...</p>
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
