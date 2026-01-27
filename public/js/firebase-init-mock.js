export const auth = {
    currentUser: { uid: 'test-user' },
    onAuthStateChanged: (cb) => {
        cb({ uid: 'test-user' });
        return () => {};
    }
};
export const db = {};
export const storage = {};
export const functions = {};
export const analytics = {};
export function initializeFirebase() {}
