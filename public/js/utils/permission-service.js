import { db } from '../firebase-init.js';
import { doc, onSnapshot, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCollectionPath } from './utils.js';

export class PermissionService {
    constructor() {
        this._unsubscribe = null;
    }

    init(user) {
        if (!user) return;
        // Clean up previous listener if exists
        if (this._unsubscribe) this._unsubscribe();

        const usersPath = getCollectionPath('users');
        const userRef = doc(db, usersPath, user.uid);

        console.log("Initializing Permission Sync Service...");

        // Listen to the Canonical Source (users)
        this._unsubscribe = onSnapshot(userRef, async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.memberOfGroups !== undefined) {
                    await this._syncToPermissionStore(user.uid, data.memberOfGroups);
                }
            }
        }, (error) => {
            console.error("PermissionService: Error listening to user profile:", error);
        });
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
