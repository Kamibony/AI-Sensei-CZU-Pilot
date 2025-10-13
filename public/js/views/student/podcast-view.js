export function renderPodcast(postData, container) {
    if (!postData || !Array.isArray(postData.episodes) || postData.episodes.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci není k dispozici žádný podcast.</p>`;
        return;
    };

    const episodesHtml = postData.episodes.map((episode, i) => `
        <div class="podcast-episode bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4 transition-all duration-300">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <button class="play-pause-btn text-3xl text-green-700 hover:text-green-600" data-episode-index="${i}">▶️</button>
                    <div>
                        <h4 class="font-bold text-md text-slate-800">${i + 1}. ${episode.title}</h4>
                        <p class="text-sm text-slate-500">Klikněte pro přehrání</p>
                    </div>
                </div>
            </div>
            <div class="script-content hidden mt-4 text-slate-600 prose prose-sm">${episode.script.replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');

    container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Podcast & Materiály</h2><div id="podcast-list">${episodesHtml}</div>`;

    const podcastList = document.getElementById('podcast-list');

    const speakText = (text, onEndCallback) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'cs-CZ';

        const voices = window.speechSynthesis.getVoices();
        const czechVoice = voices.find(voice => voice.lang === 'cs-CZ');
        if (czechVoice) {
            utterance.voice = czechVoice;
        } else {
            console.warn("Český hlas pro převod textu na řeč nebyl nalezen. Bude použit výchozí hlas prohlížeče.");
        }

        utterance.onend = onEndCallback;
        window.speechSynthesis.speak(utterance);
    };

    podcastList.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.play-pause-btn');
        if (!playBtn) return;

        const episodeIndex = parseInt(playBtn.dataset.episodeIndex, 10);
        const episodeData = postData.episodes[episodeIndex];
        const episodeElement = playBtn.closest('.podcast-episode');

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();

            let wasPlayingThis = playBtn.textContent === '⏹️';

            document.querySelectorAll('.podcast-episode').forEach(el => {
                el.classList.remove('bg-green-100', 'border-green-300');
                el.querySelector('.play-pause-btn').textContent = '▶️';
            });

            if (wasPlayingThis) return;
        }

        speakText(episodeData.title + ". " + episodeData.script, () => {
            playBtn.textContent = '▶️';
            episodeElement.classList.remove('bg-green-100', 'border-green-300');
        });

        playBtn.textContent = '⏹️';
        episodeElement.classList.add('bg-green-100', 'border-green-300');
    });
}