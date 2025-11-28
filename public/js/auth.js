import { 
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase-init.js';
import { showToast } from './utils.js';
import { translationService } from './utils/translation-service.js';

// Logic moved to LoginView component. This file now serves as a utility for logout.

export async function handleLogout() {
    try {
        await signOut(auth);
        showToast(translationService.t('auth.success_logout'), 'info');
        // onAuthStateChanged in app.js handles redirect
    } catch (error) {
        console.error("Error signing out:", error);
        showToast(translationService.t('auth.error_logout'), 'error');
    }
}
