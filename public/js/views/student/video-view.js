export function renderVideo(videoUrl, container) {
    let videoId = null;
    try {
        const url = new URL(videoUrl);
        videoId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    } catch (e) {
        const match = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        videoId = match ? match[1] : null;
    }
    if (videoId) {
        container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Video k lekci</h2><div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-4xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe></div>`;
    } else {
        container.innerHTML = `<p class="text-red-500 text-center font-semibold p-8">Vložená URL adresa videa není platná.</p>`;
    }
}