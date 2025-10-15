import { callGenerateContent } from './gemini-api.js';
import { showToast } from './utils.js';
import { handleFileUpload } from './upload-handler.js';

let editor;

export async function initializeEditor(containerId, initialContent = '') {
    const EditorJS = window.EditorJS;
    editor = new EditorJS({
        holder: containerId,
        tools: {
            header: window.Header,
            list: window.List,
            image: window.SimpleImage,
        },
        data: {
            blocks: initialContent
        },
        autofocus: true,
        placeholder: 'Zadejte / pro příkazy nebo začněte psát...',
    });
    await editor.isReady;

    document.getElementById('save-content-btn')?.addEventListener('click', saveContent);

    // AI Features
    const aiPromptInput = document.getElementById('ai-prompt');
    const generateContentBtn = document.getElementById('generate-content-btn');
    
    if (aiPromptInput && generateContentBtn) {
        generateContentBtn.addEventListener('click', generateAiContent);
    }

    // File Upload
    const fileUploadInput = document.getElementById('file-upload-input');
    const uploadButton = document.getElementById('upload-file-btn');
    if (fileUploadInput && uploadButton) {
        uploadButton.addEventListener('click', () => fileUploadInput.click());
        fileUploadInput.addEventListener('change', (event) => {
            const lessonId = document.getElementById('lesson-id-display').textContent;
            handleFileUpload(event.target.files, lessonId);
        });
    }
}

async function saveContent() {
    try {
        const outputData = await editor.save();
        console.log("Saving content:", outputData);
        // Implement save logic here
        showToast("Obsah úspěšně uložen!");
    } catch (error) {
        console.error('Saving failed: ', error);
        showToast("Uložení selhalo.", true);
    }
}

async function generateAiContent() {
    const prompt = document.getElementById('ai-prompt').value;
    const contentType = document.getElementById('content-type-selector').value;
    const lessonId = document.getElementById('lesson-id-display').textContent;

    if (!prompt) {
        showToast('Prosím, zadejte prompt pro AI.', true);
        return;
    }

    showToast('Generuji obsah, prosím čekejte...');
    
    try {
        const result = await callGenerateContent({ prompt, contentType, lessonId });

        if (result.error) {
            throw new Error(result.error);
        }

        if (contentType === 'presentation') {
            handlePresentation(result.presentation);
        } else {
            editor.render({ blocks: result.content });
        }

        showToast('Obsah byl úspěšně vygenerován!');
    } catch (error) {
        console.error('AI content generation failed:', error);
        showToast(`Generování obsahu selhalo: ${error.message}`, true);
    }
}

function handlePresentation(presentation) {
    if (!presentation || !presentation.slides) {
        console.error("Invalid presentation data received");
        return;
    }
    const blocks = presentation.slides.map(slide => {
        let block;
        if (slide.title && slide.content) {
             block = {
                type: 'header',
                data: {
                    text: slide.title,
                    level: 2
                }
            };
            editor.blocks.insert(block.type, block.data);

            const contentBlocks = slide.content.map(item => ({
                type: 'list',
                data: {
                    style: 'unordered',
                    items: [item]
                }
            }));
             contentBlocks.forEach(b => editor.blocks.insert(b.type, b.data));

        } else if (slide.title) {
            block = {
                type: 'header',
                data: {
                    text: slide.title,
                    level: 1
                }
            };
            editor.blocks.insert(block.type, block.data);
        }
       
    });
}
