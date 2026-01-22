
/**
 * Compresses and resizes an image file to reduce file size and memory usage.
 * Uses createImageBitmap or URL.createObjectURL to avoid loading the entire file into memory (base64).
 *
 * @param {File} file - The image file to compress.
 * @param {number} [maxWidth=1280] - The maximum width or height of the output image.
 * @param {number} [quality=0.7] - The JPEG quality (0.0 to 1.0).
 * @returns {Promise<Blob>} - A promise that resolves to the compressed image Blob.
 */
export async function compressImage(file, maxWidth = 1280, quality = 0.7) {
    let imageSource;
    let cleanup = () => {};

    try {
        if ('createImageBitmap' in window) {
            imageSource = await createImageBitmap(file);
        } else {
            // Fallback for older browsers or specific environments
            const url = URL.createObjectURL(file);
            cleanup = () => URL.revokeObjectURL(url);

            imageSource = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = url;
            });
        }

        return await processImage(imageSource, maxWidth, quality);
    } catch (error) {
        console.error("Image compression error:", error);
        throw error;
    } finally {
        if (typeof cleanup === 'function') {
            cleanup();
        }
        // If imageSource is an ImageBitmap, we should close it to release memory
        if (imageSource && typeof imageSource.close === 'function') {
            imageSource.close();
        }
    }
}

function processImage(imgSource, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        let width = imgSource.width;
        let height = imgSource.height;

        if (width > maxWidth || height > maxWidth) {
            if (width > height) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            } else {
                width = Math.round((width * maxWidth) / height);
                height = maxWidth;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgSource, 0, 0, width, height);

        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("Canvas toBlob failed"));
            }
        }, 'image/jpeg', quality);
    });
}
