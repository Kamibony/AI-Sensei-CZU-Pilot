
import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

export { LitElement, html, css };

export const db = { type: 'mock_db' };
export const auth = { currentUser: { uid: 'prof1' } };

// Mock Firestore
export const collection = (db, name) => ({ type: 'collection', name });
export const query = (...args) => ({ type: 'query', args });
export const where = (field, op, val) => ({ type: 'where', field, op, val });
export const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });
export const limit = (n) => ({ type: 'limit', n });
export const serverTimestamp = () => new Date();

export const getDocs = async (q) => {
    // Return mock groups
    if (q.args && q.args[0].name === 'groups') {
        return {
            docs: [
                { id: 'group1', data: () => ({ name: 'Group 1', ownerId: 'prof1' }) }
            ],
            empty: false
        };
    }
    return { docs: [], empty: true };
};

export const onSnapshot = (q, callback) => {
    // If querying active session, initially return empty unless we set a flag
    // We can expose a global to control this?
    // For manual input test, we start with no session.
    callback({ empty: true, docs: [], forEach: () => {} });
    return () => {}; // unsubscribe
};

export class ProfessorDataService {
    constructor() {
        this.auth = auth;
    }
    async fetchLessons() { return []; }
    async getStudentsByGroup() { return []; }
    async createPracticalSession(groupId, activeTask) {
        console.log(`[Mock] createPracticalSession called with groupId=${groupId}, activeTask="${activeTask}"`);
        window.lastCreatedSession = { groupId, activeTask };
        return "session_id_123";
    }
    async updateActiveTask(sessionId, task) {
        console.log(`[Mock] updateActiveTask called with sessionId=${sessionId}, task="${task}"`);
        window.lastUpdatedTask = { sessionId, task };
    }
    async endPracticalSession() {}
}
