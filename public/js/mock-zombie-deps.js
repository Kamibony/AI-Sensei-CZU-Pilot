
// Mock Dependencies for Split-Brain Verification

// Firestore Mocks
export const collection = () => "collection";
export const query = (...args) => args;
export const where = (field, op, val) => ({type: 'where', field, op, val});
export const orderBy = (field, dir) => {
    console.warn(`[Mock] orderBy called with ${field} ${dir}. This should be REMOVED in the fix.`);
    return {type: 'orderBy', field, dir};
};
export const limit = (n) => ({type: 'limit', n});
export const doc = () => "doc";
export const getDoc = async () => ({
    exists: () => true,
    data: () => ({ memberOfGroups: ['group1'] })
});
export const onSnapshot = (q, callback) => {
    console.log("[Mock] onSnapshot called with query:", JSON.stringify(q, null, 2));

    // Check if orderBy is present in the query args
    const hasOrderBy = q.some(arg => arg && arg.type === 'orderBy');
    if (hasOrderBy) {
        console.error("[FAIL] Query still contains orderBy!");
    } else {
        console.log("[PASS] Query does not contain orderBy.");
    }

    setTimeout(() => {
        const snapshot = {
            empty: false,
            docs: [
                {
                    id: 'zombie-session-FT...',
                    data: () => ({
                         groupId: 'group1',
                         status: 'active',
                         startTime: { toDate: () => new Date('2023-01-01T10:00:00') },
                         task: "Zombie Task (Old)"
                    })
                },
                {
                    id: 'new-session-0k...',
                    data: () => ({
                         groupId: 'group1',
                         status: 'active',
                         startTime: { toDate: () => new Date('2024-05-20T10:00:00') }, // Newer
                         task: "New Active Task (Fresh)"
                    })
                }
            ]
        };
        console.log("[Mock] Sending snapshot with 2 sessions (Zombie + New).");
        callback(snapshot);
    }, 500);
    return () => {};
};
export const addDoc = async () => {};
export const serverTimestamp = () => new Date();
export const updateDoc = async () => {};
export const arrayUnion = () => {};
export const getDocs = async () => ({ empty: true, docs: [] });
export const setDoc = async () => {};

// Storage Mocks
export const ref = () => {};
export const uploadBytes = async () => {};
export const getDownloadURL = async () => "http://mock.url";

// Firebase Init Mocks
export const db = {};
export const auth = { currentUser: { uid: 'student1' } };
export const storage = {};
