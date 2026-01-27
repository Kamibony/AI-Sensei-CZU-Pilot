export const functions = {};
export const db = {};
export const auth = { currentUser: { uid: 'test-user' } };
export const storage = {};
export const translationService = {
    t: (key) => key,
    subscribe: () => () => {},
    currentLanguage: 'cs'
};
export const Localized = (superClass) => class extends superClass {
    t(key) { return key; }
};
export class BaseView extends HTMLElement {
    createRenderRoot() { return this; }
    requestUpdate() {}
}
// Mock LitElement basics if needed, but we load real Lit from CDN usually.
// However, the views import Lit from CDN. I can let them do that.
// But they import Localized from local file.

// We need to handle:
// import { Localized } from '../../utils/localization-mixin.js';
// import * as firebaseInit from '../../firebase-init.js';
// import { BaseView } from './base-view.js';
