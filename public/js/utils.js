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
        // alert(message); // Alert je otravný, radšej len log
    }
};

/**
 * Zobrazí globálny spinner (načítavanie)
 * @param {string} message - Text pod spinnerom
 */
export const showGlobalSpinner = (message = 'Načítám...') => {
    const spinner = document.getElementById('global-loading-overlay');
    // Skúsime nájsť aj alternatívne ID, ak sa v HTML volá inak
    const spinnerAlt = document.getElementById('global-spinner');
    const target = spinner || spinnerAlt;

    if (target) {
        target.classList.remove('hidden');
        target.classList.add('flex'); // Uistíme sa, že je flex pre centrovanie
        
        // Skúsime nájsť text element
        const textEl = target.querySelector('p') || document.getElementById('global-spinner-text');
        if (textEl) textEl.textContent = message;
    }
};

/**
 * Skryje globálny spinner
 */
export const hideGlobalSpinner = () => {
    const spinner = document.getElementById('global-loading-overlay');
    const spinnerAlt = document.getElementById('global-spinner');
    const target = spinner || spinnerAlt;

    if (target) {
        target.classList.add('hidden');
        target.classList.remove('flex');
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
