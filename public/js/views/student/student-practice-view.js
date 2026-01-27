import { LitElement, html } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, doc, getDoc, updateDoc, arrayUnion, getDocs, setDoc, documentId } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, storage } from "../../firebase-init.js";
import { SUBMISSION_STATUS, SUBMISSION_OUTCOME } from "../../shared-constants.js";
import { compressImage } from "../../utils/image-utils.js";

export class StudentPracticeView extends LitElement {
    static properties = {
        activeSession: { type: Object },
        selectedGroupId: { type: String },
        submission: { type: Object },
        isUploading: { type: Boolean },
        isProcessing: { type: Boolean },
        uploadError: { type: String },
        hasNoGroups: { type: Boolean },
        isAutoJoining: { type: Boolean },
        userGroups: { type: Array }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.activeSession = null;
        this.selectedGroupId = null;
        this.sessionsMap = new Map();
        this.submission = null;
        this.isUploading = false;
        this.isProcessing = false;
        this.uploadError = null;
        this.hasNoGroups = false;
        this.isAutoJoining = false;
        this.userGroups = [];
        this._unsubscribeSession = null;
        this._unsubscribeSubmission = null;
        this._sessionListeners = [];
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
            let groups = injectedGroups;
            const userDocRef = doc(db, 'students', user.uid);

            if (!groups) {
                const userDoc = await getDoc(userDocRef);
                groups = userDoc.exists() ? (userDoc.data().memberOfGroups || []) : [];
            }

            try {
                const ownedGroupsQuery = query(collection(db, 'groups'), where('ownerId', '==', user.uid));
                const ownedDocs = await getDocs(ownedGroupsQuery);
                const ownedIds = ownedDocs.docs.map(d => d.id);
                groups = [...new Set([...groups, ...ownedIds])];
            } catch (err) {
                console.warn("Failed to fetch owned groups:", err);
            }

            this.userGroups = groups;

            if (groups.length === 0) {
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
                                    throw err;
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

            if (this._sessionListeners.length > 0) {
                this._sessionListeners.forEach(unsub => unsub());
                this._sessionListeners = [];
            }

            const searchGroups = groups.slice(0, 10);
            const localStateMap = new Map();

            const updateConsolidatedState = (groupId, source, data) => {
                if (!localStateMap.has(groupId)) localStateMap.set(groupId, { group: null, signal: null, groupName: '' });
                const entry = localStateMap.get(groupId);

                if (data && data.groupName) {
                    entry.groupName = data.groupName;
                }

                entry[source] = data;

                const active = entry.group || entry.signal;

                if (active) {
                    this.sessionsMap.set(groupId, {
                        id: active.id,
                        task: active.task || "Načítám zadání...",
                        groupId: groupId,
                        groupName: entry.groupName || `Třída ${groupId}`
                    });
                } else {
                    if (this.sessionsMap.has(groupId)) {
                        this.sessionsMap.delete(groupId);
                    }
                }

                this._recalculateActiveSession();
            };

            searchGroups.forEach(groupId => {
                const groupRef = doc(db, 'groups', groupId);
                const unsubGroup = onSnapshot(groupRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const groupName = data.name || "Třída";

                        if (data.sessionStatus === 'active' && data.activeSessionId) {
                            updateConsolidatedState(groupId, 'group', {
                                id: data.activeSessionId,
                                task: data.activeTask,
                                groupName: groupName
                            });
                        } else {
                            updateConsolidatedState(groupId, 'group', null);
                             if (!localStateMap.has(groupId)) localStateMap.set(groupId, { group: null, signal: null, groupName: '' });
                             localStateMap.get(groupId).groupName = groupName;
                        }
                    } else {
                        updateConsolidatedState(groupId, 'group', null);
                    }
                }, err => console.warn("Group listener error", err));
                this._sessionListeners.push(unsubGroup);

                const signalRef = doc(db, 'groups', groupId, 'live_status', 'current');
                const unsubSignal = onSnapshot(signalRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.status === 'active' && data.activeSessionId) {
                            updateConsolidatedState(groupId, 'signal', {
                                id: data.activeSessionId,
                                task: data.task
                            });
                        } else {
                            updateConsolidatedState(groupId, 'signal', null);
                        }
                    } else {
                        updateConsolidatedState(groupId, 'signal', null);
                    }
                }, err => console.warn("Signal listener error", err));
                this._sessionListeners.push(unsubSignal);
            });

            this._unsubscribeSession = () => {
                this._sessionListeners.forEach(unsub => unsub());
                this._sessionListeners = [];
            };
        } catch (e) {
            console.error("Error fetching session:", e);
        }
    }

    _recalculateActiveSession() {
        const activeSessionsList = Array.from(this.sessionsMap.values());

        if (activeSessionsList.length === 0) {
            this.activeSession = null;
            this.submission = null;
            this.requestUpdate();
            return;
        }

        if (activeSessionsList.length === 1) {
            const session = activeSessionsList[0];
            if (!this.activeSession || this.activeSession.id !== session.id) {
                this.selectedGroupId = session.groupId;
                this.activeSession = session;
                this._checkSubmission(session.id);
            } else if (JSON.stringify(this.activeSession) !== JSON.stringify(session)) {
                 this.activeSession = session;
            }
             this.requestUpdate();
            return;
        }

        if (this.selectedGroupId && this.sessionsMap.has(this.selectedGroupId)) {
            const session = this.sessionsMap.get(this.selectedGroupId);
             if (!this.activeSession || JSON.stringify(this.activeSession) !== JSON.stringify(session)) {
                this.activeSession = session;
                if (this.activeSession.id !== session.id) {
                    this._checkSubmission(session.id);
                }
             }
        } else {
             const session = activeSessionsList[0];
             this.selectedGroupId = session.groupId;
             this.activeSession = session;
             this._checkSubmission(session.id);
        }
        this.requestUpdate();
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

        this.isProcessing = true;
        this.uploadError = null;
        let fileToUpload = file;

        try {
            try {
                fileToUpload = await compressImage(file);
            } catch (compressionError) {
                console.warn("Image compression failed, proceeding with original file:", compressionError);
            }

            this.isProcessing = false;
            this.isUploading = true;

            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated");

            const timestamp = Date.now();
            const storagePath = `practical_uploads/${this.activeSession.id}/${user.uid}_${timestamp}.jpg`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, fileToUpload);

            await addDoc(collection(db, 'practical_submissions'), {
                sessionId: this.activeSession.id,
                studentId: user.uid,
                storagePath: storagePath,
                submittedAt: serverTimestamp(),
                status: SUBMISSION_STATUS.PENDING
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
                <div class="max-w-2xl mx-auto p-6 h-screen flex flex-col justify-center items-center">
                    <div class="bg-white rounded-2xl shadow-xl p-8 text-center animate-pulse border border-slate-100">
                        <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                            <svg class="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                        <h2 class="text-xl font-bold text-slate-800">Připojování k výcviku...</h2>
                        <p class="text-slate-500 mt-2">Hledáme aktivní lekci vaší třídy.</p>
                    </div>
                </div>
            `;
        }

        if (this.hasNoGroups) {
             return html`
                <div class="max-w-2xl mx-auto p-6 mt-12">
                    <div class="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
                        <div class="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                            <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-2">Žádná třída</h2>
                        <p class="text-slate-600">Nejste zařazeni do žádné třídy. Požádejte učitele o přidání.</p>
                    </div>
                </div>
            `;
        }

        if (!this.activeSession) {
            return html`
                <div class="max-w-2xl mx-auto p-6 mt-12">
                    <div class="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
                        <div class="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                            <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-2">Žádný aktivní výcvik</h2>
                        <p class="text-slate-600">V tuto chvíli neprobíhá žádný odborný výcvik. Počkejte na pokyn mistra.</p>
                    </div>
                </div>
            `;
        }

        const activeSessionsList = Array.from(this.sessionsMap.values());

        return html`
            <div class="max-w-2xl mx-auto p-4 md:p-6">

                ${activeSessionsList.length > 1 ? html`
                    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6 p-2 flex flex-wrap gap-2">
                        ${activeSessionsList.map(session => html`
                            <button
                                @click="${() => { this.selectedGroupId = session.groupId; this._recalculateActiveSession(); }}"
                                class="flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${this.selectedGroupId === session.groupId ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}"
                            >
                                ${session.groupName}
                            </button>
                        `)}
                    </div>
                ` : ''}

                <div class="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                    <div class="bg-slate-900 px-6 py-4">
                        <h1 class="text-lg font-bold text-white flex items-center gap-2">
                            <span class="flex h-3 w-3 relative">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                            Odborný Výcvik
                            ${activeSessionsList.length > 1 ? html`<span class="ml-auto text-xs font-normal text-slate-400 opacity-80">${this.activeSession.groupName}</span>` : ''}
                        </h1>
                    </div>

                    <div class="p-6 md:p-8">
                        <div class="bg-gradient-to-br from-sky-50 to-blue-50 border border-blue-100 rounded-2xl p-6 mb-8 shadow-inner text-center">
                            <p class="text-sm font-bold text-blue-600 uppercase tracking-wide mb-2">Aktuální Úkol</p>
                            <div class="text-xl md:text-2xl font-medium text-slate-900">
                                ${this.activeSession.task || "Čekejte na zadání úkolu..."}
                            </div>
                        </div>

                        ${this.submission ? this._renderSubmissionStatus() : this._renderUploadForm()}
                    </div>
                </div>
            </div>
        `;
    }

    _renderUploadForm() {
        if (this.isProcessing) {
             return html`
                <div class="flex flex-col items-center py-8">
                    <div class="relative">
                        <div class="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                        <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                    </div>
                    <p class="text-indigo-800 font-bold mt-4 text-lg">Zpracovávám fotku...</p>
                    <p class="text-slate-500 text-sm">Optimalizuji velikost obrázku</p>
                </div>
            `;
        }

        if (this.isUploading) {
            return html`
                <div class="flex flex-col items-center py-8">
                    <div class="relative">
                        <div class="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        </div>
                    </div>
                    <p class="text-blue-800 font-bold mt-4 text-lg">Nahrávám fotografii...</p>
                    <p class="text-slate-500 text-sm">Prosím nezavírejte okno</p>
                </div>
            `;
        }

        return html`
            <div class="flex flex-col items-center w-full">
                <!-- Camera Input (Direct Capture) -->
                <input
                    type="file"
                    id="cameraInput"
                    accept="image/*"
                    capture="environment"
                    @change="${this._handleFileUpload}"
                    class="hidden"
                >

                <!-- Gallery Input (File Selection) -->
                <input
                    type="file"
                    id="fileInput"
                    accept="image/*"
                    @change="${this._handleFileUpload}"
                    class="hidden"
                >

                <div class="grid grid-cols-1 gap-4 w-full">
                    <button
                        class="group relative w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-blue-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        ?disabled="${!this.activeSession.task}"
                        @click="${() => this.querySelector('#cameraInput').click()}"
                    >
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Vyfotit
                    </button>

                    <button
                        class="group relative w-full py-4 bg-white border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-2xl font-bold text-lg transition-all transform active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        ?disabled="${!this.activeSession.task}"
                        @click="${() => this.querySelector('#fileInput').click()}"
                    >
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        Vybrat z galerie
                    </button>
                </div>

                <p class="text-sm text-slate-400 mt-6 text-center">
                    Pro splnění úkolu vyfoťte svou práci nebo nahrajte fotku.
                </p>

                ${this.uploadError ? html`<div class="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100 w-full text-center flex items-center justify-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>${this.uploadError}</div>` : ''}
            </div>
        `;
    }

    _renderSubmissionStatus() {
        const s = this.submission;
        let themeClass = "bg-yellow-50 border-yellow-200";
        let titleColor = "text-yellow-800";
        let icon = html`<svg class="w-12 h-12 text-yellow-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        let statusText = "AI hodnotí tvou práci...";
        let isDone = false;
        let isFail = false;

        if (s.status === SUBMISSION_STATUS.EVALUATED) {
            if (s.result === SUBMISSION_OUTCOME.FAIL || s.grade === 'F') {
                themeClass = "bg-red-50 border-red-200";
                titleColor = "text-red-800";
                icon = html`<svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
                statusText = "Je třeba opravit";
                isDone = true;
                isFail = true;
            } else {
                themeClass = "bg-green-50 border-green-200";
                titleColor = "text-green-800";
                icon = html`<svg class="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
                statusText = "Splněno";
                isDone = true;
            }
        } else if (s.status === SUBMISSION_STATUS.ERROR) {
            themeClass = "bg-red-50 border-red-200";
            titleColor = "text-red-800";
            icon = html`<svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
            statusText = "Chyba při zpracování";
            isFail = true;
            isDone = true;
        }

        return html`
            <div class="border-2 ${themeClass} rounded-2xl p-6 text-center transition-all">
                <div class="flex justify-center mb-4">
                    ${icon}
                </div>

                <h2 class="text-2xl font-bold ${titleColor} mb-2">${statusText}</h2>

                ${s.imageUrl ? html`
                    <div class="relative group mt-6 mb-6">
                        <img
                            src="${s.imageUrl}"
                            alt="Odevzdaná práce"
                            class="w-full max-h-[400px] object-cover rounded-xl shadow-lg ring-1 ring-slate-900/5 bg-white"
                        >
                    </div>
                ` : ''}

                ${isDone ? html`
                    <div class="bg-white rounded-xl border border-slate-100 p-6 shadow-sm text-left">
                        ${s.status === SUBMISSION_STATUS.EVALUATED ? html`
                            <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                                <span class="text-sm font-bold text-slate-500 uppercase">Známka</span>
                                <span class="text-3xl font-extrabold ${isFail ? 'text-red-600' : 'text-green-600'}">${s.grade}</span>
                            </div>
                            <div>
                                <h3 class="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                                    <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                                    Hodnocení mistra (AI):
                                </h3>
                                <div class="prose prose-sm text-slate-600 italic bg-slate-50 p-4 rounded-lg border border-slate-100 relative">
                                    <span class="absolute top-2 left-2 text-3xl text-slate-200 leading-none">"</span>
                                    <p class="relative z-10 whitespace-pre-wrap">${s.feedback}</p>
                                    <span class="absolute bottom-[-10px] right-2 text-3xl text-slate-200 leading-none">"</span>
                                </div>
                            </div>
                        ` : html`
                            <p class="text-red-600 font-medium">${s.error || "Nastala neočekávaná chyba."}</p>
                        `}
                    </div>

                    ${isFail ? html`
                        <div class="mt-6">
                            <button
                                @click="${this._handleRetry}"
                                class="w-full py-3 bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                Zkusit to znovu
                            </button>
                            <p class="text-xs text-red-400 mt-2">Předchozí pokus bude smazán.</p>
                        </div>
                    ` : ''}
                ` : html`
                    <p class="text-slate-500 text-sm mt-4 animate-pulse">Analyzuji fotografii, vydrž chvilku...</p>
                `}
            </div>
        `;
    }

    async _handleRetry() {
        if (this.submission) {
            if(!confirm("Opravdu chcete smazat tento pokus a začít znovu?")) return;
            try {
                await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(m => m.deleteDoc(doc(db, 'practical_submissions', this.submission.id)));
            } catch (e) {
                console.error("Delete failed", e);
                alert("Nepodařilo se restartovat úkol.");
            }
        }
    }
}
customElements.define('student-practice-view', StudentPracticeView);
