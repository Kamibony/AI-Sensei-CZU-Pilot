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
export const getDoc = async () => ({ exists: () => true, data: () => ({}) });
export const collection = () => ({});
export const query = () => ({});
export const where = () => ({});
export const onSnapshot = () => () => {};

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
