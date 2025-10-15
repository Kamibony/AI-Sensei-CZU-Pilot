import { handleLogout } from '../../auth.js';

// Odstránili sme 'lessons' z parametrov, už ich nepotrebujeme
export function setupNavigation() {
    const navLinks = document.getElementById('nav-links');
    const logoutBtn = document.getElementById('logout-btn');

    if (!navLinks) {
        console.error("Navigačný element 'nav-links' nebol nájdený!");
        return;
    }

    const links = [
        { id: 'timeline-link', text: 'Časová osa', hash: '#/timeline' },
        { id: 'students-link', text: 'Studenti', hash: '#/students' },
    ];

    navLinks.innerHTML = ''; 
    links.forEach(link => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link.hash;
        a.id = link.id;
        a.textContent = link.text;
        a.className = 'block py-2 px-4 hover:bg-gray-700 rounded';
        li.appendChild(a);
        navLinks.appendChild(li);
    });

    const updateActiveLink = () => {
        const currentHash = window.location.hash || '#/timeline';
        navLinks.querySelectorAll('a').forEach(el => {
            if (el.getAttribute('href') === currentHash) {
                el.classList.add('bg-gray-700');
            } else {
                el.classList.remove('bg-gray-700');
            }
        });
    };

    window.removeEventListener('hashchange', updateActiveLink); // Pre istotu odstránime starý
    window.addEventListener('hashchange', updateActiveLink);
    updateActiveLink(); 

    if (logoutBtn) {
        logoutBtn.removeEventListener('click', handleLogout); 
        logoutBtn.addEventListener('click', handleLogout);
    }
}
