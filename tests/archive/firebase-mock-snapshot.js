export const initializeApp = () => ({});
export const getApps = () => [];
export const getApp = () => ({});
export const getAuth = () => ({ currentUser: { uid: 'testUser' } });
export const connectAuthEmulator = () => {};
export const getFirestore = () => ({});
export const connectFirestoreEmulator = () => {};
export const getStorage = () => ({});
export const connectStorageEmulator = () => {};
export const getFunctions = () => ({});
export const connectFunctionsEmulator = () => {};
export const getAnalytics = () => ({});
export const doc = () => ({});
export const getDoc = () => Promise.resolve({ exists: () => false });
export const updateDoc = () => Promise.resolve();
export const setDoc = () => Promise.resolve();
export const addDoc = () => Promise.resolve();
export const deleteField = () => {};
export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion = () => {};
export const arrayRemove = () => {};
export const collection = () => {};
export const getDocs = () => Promise.resolve({ docs: [] });
export const where = () => {};
export const query = () => {};
export const orderBy = () => {};
export const limit = () => {};
export const onSnapshot = (ref, callback) => {
    // Simulate async data load
    setTimeout(() => {
        callback({
            exists: () => true,
            data: () => ({ selectedRole: null, completedTasks: [] })
        });
    }, 100);
    return () => {};
};
export const ref = () => {};
export const getDownloadURL = () => Promise.resolve("url");
export const uploadBytesResumable = () => ({ on: () => {} });
export const uploadString = () => Promise.resolve();
export const httpsCallable = () => () => Promise.resolve({ data: {} });
