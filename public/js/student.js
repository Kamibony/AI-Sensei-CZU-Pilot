import { db, auth, functions } from './firebase-init.js';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    getDoc,
    orderBy,
    updateDoc,
    arrayUnion,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from './utils.js';
import { translationService } from './utils/translation-service.js';

// Import views
import './views/student/student-dashboard-view.js';
import './student/student-classes-view.js';
import './student/student-lesson-list.js';
import './student/student-lesson-detail.js';
import './student/student-class-detail.js';

export function initStudentApp(user) {
    const app = document.createElement('student-dashboard');
    app.user = user;

    const container = document.getElementById('role-content-wrapper');
    if (container) {
        container.innerHTML = '';
        container.appendChild(app);
    }
}
