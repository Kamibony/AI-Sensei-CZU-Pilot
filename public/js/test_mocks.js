// Mock implementation of dependencies for test_editor.html
export const getFirestore = () => ({});
export const getStorage = () => ({});
export const getFunctions = () => ({});
export const httpsCallable = () => async () => ({ data: {} });
export const ref = () => ({});
export const uploadBytes = async () => ({});
export const getDownloadURL = async () => "http://mock-url.com";
export const doc = () => ({});
export const setDoc = async () => ({});
export const updateDoc = async () => ({});
export const deleteField = () => ({});
export const serverTimestamp = () => ({});
export const addDoc = async () => ({});
export const getDoc = async () => ({ exists: () => true, data: () => ({}) });
export const getDocs = async () => ({ empty: true, docs: [] });
export const collection = () => ({});
export const query = () => ({});
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const onSnapshot = () => () => {};

// Emulator connections (mocks)
export const connectFirestoreEmulator = () => {};
export const connectAuthEmulator = () => {};
export const connectStorageEmulator = () => {};
export const connectFunctionsEmulator = () => {};

// App
export const initializeApp = () => ({});
export const getApps = () => [];
export const getApp = () => ({});
export const getAuth = () => ({ currentUser: { uid: 'mock-user' } });
export const getAnalytics = () => ({});

// Storage
export const uploadBytesResumable = () => ({ on: (evt, progress, err, complete) => complete() });

// Mock BaseView
export class BaseView extends HTMLElement {
    constructor() {
        super();
    }
    createRenderRoot() { return this; }
    requestUpdate() { return Promise.resolve(); }
}
export class LitElement extends BaseView {}
export const html = (strings, ...values) => strings[0]; // Simple mock
export const css = () => "";

// Mock other utils
export const showToast = () => {};
export const TranslationService = { translate: (key) => key };
export const GeminiAPI = { generate: async () => ({}) };
export const UploadHandler = { upload: async () => ({}) };
export const LocalizationMixin = (Base) => class extends Base { t(key) { return key; } };
export const parseAIResponse = () => ({});

// Mock for GuideBot
export const getAiAssistantResponse = async () => ({ answer: "This is a mock response." });
export const APP_KNOWLEDGE_BASE = "Mock Knowledge Base";
export const auth = { currentUser: { uid: 'mock-user' } };
export const db = {};
export const functions = {};
export const app = {};
export const storage = {};
export const analytics = {};

// init function
export const initializeFirebase = async () => {};
