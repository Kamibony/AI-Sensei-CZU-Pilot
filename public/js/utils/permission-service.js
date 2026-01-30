import { db } from '../firebase-init.js';
import { doc, onSnapshot, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCollectionPath } from './utils.js';

export class PermissionService {
    constructor() {
        this._unsubscribe = null;
        this._readyPromise = null;
        this._resolveReady = null;
    }

    init(user) {
        if (!user) return;

        // Reset promise for new initialization
        if (this._resolveReady) {
             // If there was a pending promise, resolve it (though likely we are restarting)
             this._resolveReady(false);
        }

        this._readyPromise = new Promise((resolve) => {
            this._resolveReady = resolve;
        });

        // Clean up previous listener if exists
        if (this._unsubscribe) this._unsubscribe();

        const usersPath = getCollectionPath('users');
        const userRef = doc(db, usersPath, user.uid);

        console.log("Initializing Permission Sync Service...");

        // Listen to the Canonical Source (users)
        this._unsubscribe = onSnapshot(userRef, async (snapshot) => {
            try {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.memberOfGroups !== undefined) {
                        await this._syncToPermissionStore(user.uid, data.memberOfGroups);
                    }
                }
            } catch (error) {
                console.error("PermissionService: Sync error:", error);
            } finally {
                // Mark as ready after the first processing attempt
                if (this._resolveReady) {
                    console.log("PermissionService: Initial sync complete.");
                    this._resolveReady(true);
                    this._resolveReady = null; // Prevent multiple resolutions
                }
            }
        }, (error) => {
            console.error("PermissionService: Error listening to user profile:", error);
            // Even on error, we should release the block
            if (this._resolveReady) {
                this._resolveReady(false);
                this._resolveReady = null;
            }
        });
    }

    async ready() {
        if (!this._readyPromise) return true;
        return this._readyPromise;
    }

    dispose() {
        if (this._unsubscribe) {
            console.log("Disposing Permission Sync Service...");
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    async _syncToPermissionStore(uid, canonicalGroups) {
        try {
            const studentsPath = getCollectionPath('students');
            const studentRef = doc(db, studentsPath, uid);

            // We need to read the current state to avoid unnecessary writes
            const studentSnap = await getDoc(studentRef);

            const currentGroups = studentSnap.exists() ? (studentSnap.data().memberOfGroups || []) : [];
            const newGroups = canonicalGroups || [];

            // Simple array comparison
            const needsUpdate = JSON.stringify(newGroups.sort()) !== JSON.stringify(currentGroups.sort());

            if (needsUpdate || !studentSnap.exists()) {
                console.log("PermissionService: Syncing groups to students collection...", newGroups);
                await setDoc(studentRef, {
                    memberOfGroups: newGroups,
                    updatedAt: new Date(),
                    lastSyncedBy: 'client-permission-service'
                }, { merge: true });
            }
        } catch (e) {
            console.error("PermissionService: Sync failed:", e);
        }
    }
}

export const permissionService = new PermissionService();
