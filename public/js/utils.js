export function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'fixed bottom-5 right-5 p-4 rounded shadow-lg text-white';

    if (isError) {
        toast.classList.add('bg-red-500');
    } else {
        toast.classList.add('bg-green-500');
    }

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
