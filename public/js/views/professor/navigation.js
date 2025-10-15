import { renderTimeline } from './timeline-view.js';
import { renderStudents } from './students-view.js';
import { renderInteractions } from './interactions-view.js';
import { handleLogout } from '../../auth.js';

// PRIDANÝ EXPORT -> TOTO JE JEDINÁ ZMENA
export function setupNavigation(lessons) {
    const navLinks = document.getElementById('nav-links');
    const logoutBtn = document.getElementById('logout-btn');

    const links = [
        { id: 'timeline-link', text: 'Časová osa', action: () => renderTimeline(lessons) },
        { id: 'students-link', text: 'Studenti', action: renderStudents },
    ];

    navLinks.innerHTML = '';
    links.forEach(link => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.id = link.id;
        a.textContent = link.text;
        a.className = 'block py-2 px-4 hover:bg-gray-700 rounded';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            // Deactivate all links
            navLinks.querySelectorAll('a').forEach(el => el.classList.remove('bg-gray-700'));
            // Activate clicked link
            a.classList.add('bg-gray-700');
            link.action();
        });
        li.appendChild(a);
        navLinks.appendChild(li);
    });

    // Set timeline as active by default
    document.getElementById('timeline-link').classList.add('bg-gray-700');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}
