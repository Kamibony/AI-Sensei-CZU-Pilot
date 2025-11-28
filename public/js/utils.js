// public/js/utils.js

let toastContainer = null;

function createToastContainer() {
    if (!document.getElementById('toast-container')) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed bottom-5 right-5 z-50';
        document.body.appendChild(toastContainer);
    } else {
        toastContainer = document.getElementById('toast-container');
    }
}

export function showToast(message, isError = false) {
    if (!toastContainer) {
        createToastContainer();
    }

    const toast = document.createElement('div');
    const baseClasses = 'px-4 py-3 rounded-lg shadow-lg text-white mb-2 transform transition-all duration-300 ease-in-out';
    const colorClasses = isError ? 'bg-red-500' : 'bg-green-500';

    toast.className = `${baseClasses} ${colorClasses}`;
    toast.textContent = message;

    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';

    toastContainer.prepend(toast);

    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 100);

    // Animate out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.addEventListener('transitionend', () => toast.remove());
    }, 5000);
}


function createGlobalSpinner() {
    if (!document.getElementById('global-spinner')) {
        const spinnerContainer = document.createElement('div');
        spinnerContainer.id = 'global-spinner';
        spinnerContainer.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 hidden';
        spinnerContainer.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-xl flex items-center space-x-4">
                <svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span id="global-spinner-message" class="text-lg font-medium text-gray-700">Načítám...</span>
            </div>
        `;
        document.body.appendChild(spinnerContainer);
    }
}

export function showGlobalSpinner(message) {
    createGlobalSpinner(); // Ensure it exists
    const spinner = document.getElementById('global-spinner');
    const spinnerMessage = document.getElementById('global-spinner-message');

    // Lazy import or global access for translationService?
    // Since utils is imported by many things, circular dependency risk.
    // Better to pass translated message, OR default to 'Loading...' if undefined.
    // But request was to localize "Načítám...".
    // Assuming translationService is available or we import it dynamically if needed.
    // However, simplest fix for now:
    const defaultMsg = window.translationService ? window.translationService.t('common.loading') : "Loading...";
    const displayMsg = message || defaultMsg;

    if (spinnerMessage) {
        spinnerMessage.textContent = displayMsg;
    }
    if (spinner) {
        spinner.classList.remove('hidden');
    }
}

export function hideGlobalSpinner() {
    const spinner = document.getElementById('global-spinner');
    if (spinner) {
        spinner.classList.add('hidden');
    }
}
