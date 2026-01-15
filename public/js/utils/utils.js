import { auth } from '../firebase-init.js';

/**
 * Zobrazí notifikáciu (Toast)
 * @param {string} message - Text správy
 * @param {string} type - Typ správy: 'success', 'error', 'info', 'warning'
 */
export const showToast = (message, type = 'info') => {
    let backgroundColor;
    switch (type) {
        case 'success':
            backgroundColor = "linear-gradient(to right, #00b09b, #96c93d)";
            break;
        case 'error':
            backgroundColor = "linear-gradient(to right, #ff5f6d, #ffc371)";
            break;
        case 'warning':
            backgroundColor = "linear-gradient(to right, #f7971e, #ffd200)";
            break;
        default:
            backgroundColor = "linear-gradient(to right, #4facfe, #00f2fe)";
    }

    if (typeof Toastify === 'function') {
        Toastify({
            text: message,
            duration: 3000,
            close: true,
            gravity: "top", 
            position: "right", 
            style: {
                background: backgroundColor,
            },
        }).showToast();
    } else {
        console.log(`[Toast ${type}]: ${message}`);
        // Fallback ak Toastify nie je načítané
        alert(message);
    }
};

/**
 * Zobrazí globálny spinner s textom
 * @param {string} message
 */
export const showGlobalSpinner = (message = 'Načítám...') => {
    let spinner = document.getElementById('global-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'global-spinner';
        spinner.className = 'fixed inset-0 bg-white/80 z-[9999] flex flex-col items-center justify-center';
        spinner.innerHTML = `
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <div id="global-spinner-text" class="text-slate-600 font-medium">${message}</div>
        `;
        document.body.appendChild(spinner);
    } else {
        const textEl = document.getElementById('global-spinner-text');
        if (textEl) textEl.textContent = message;
        spinner.classList.remove('hidden');
    }
};

/**
 * Skryje globálny spinner
 */
export const hideGlobalSpinner = () => {
    const spinner = document.getElementById('global-spinner');
    if (spinner) {
        spinner.classList.add('hidden');
    }
};

/**
 * Formátuje dátum (Fix pre "Invalid Date")
 * Zvláda: Firebase Timestamp, JS Date object, ISO string, null
 */
export const formatDate = (date) => {
    if (!date) return '';
    
    try {
        // 1. Ak je to Firebase Timestamp (má metódu toDate)
        if (date && typeof date.toDate === 'function') {
            return date.toDate().toLocaleDateString('cs-CZ', {
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // 2. Ak je to štandardný JS Date
        if (date instanceof Date) {
            return date.toLocaleDateString('cs-CZ', {
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // 3. Ak je to string (ISO) alebo číslo
        const d = new Date(date);
        if (isNaN(d.getTime())) return ''; // Invalid Date check
        
        return d.toLocaleDateString('cs-CZ', {
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

    } catch (e) {
        console.error("Error formatting date:", e);
        return '';
    }
};

/**
 * Generuje náhodné ID
 */
export const generateId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * Bezpečné parsovanie JSON
 */
export const safeJsonParse = (str) => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
};

/**
 * Returns the collection path based on user role (anonymous demo user vs regular user).
 * @param {string} collectionName - The name of the collection (e.g., 'lessons', 'classes').
 * @returns {string} The resolved path.
 */
export const getCollectionPath = (collectionName) => {
    const user = auth.currentUser;
    // Check if user is anonymous (Demo Mode)
    if (user && user.isAnonymous) {
        return `artifacts/ai-sensei/users/${user.uid}/${collectionName}`;
    }
    return collectionName;
};
