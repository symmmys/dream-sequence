/** Browser-only image decoding adapter. It returns plain RGBA raster data. */

class BrowserHeightmapLoader {
    async load(source, options = {}) {
        if (isImageData(source)) return copyImageData(source);
        if (typeof createImageBitmap === 'function') {
            return this.loadImageBitmap(source, options);
        }
        return this.loadHtmlImage(source, options);
    }

    async loadImageBitmap(source, options) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(await resolveImageSource(source));
            return this.readBitmap(bitmap, options);
        } catch (error) {
            throw createLoadError(source, error);
        } finally {
            bitmap?.close?.();
        }
    }

    readBitmap(bitmap, options) {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Unable to create a heightmap canvas context.');
        context.drawImage(bitmap, 0, 0);
        return copyImageData(context.getImageData(0, 0, bitmap.width, bitmap.height), options);
    }

    async loadHtmlImage(source, options) {
        if (typeof source !== 'string') {
            throw new TypeError('This browser requires an image URL when createImageBitmap is unavailable.');
        }
        const image = new Image();
        image.crossOrigin = options.crossOrigin ?? 'anonymous';
        const loaded = new Promise(resolveImageLoad.bind(null, image));
        image.src = source;
        try {
            await loaded;
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Unable to create a heightmap canvas context.');
            context.drawImage(image, 0, 0);
            return copyImageData(context.getImageData(0, 0, canvas.width, canvas.height), options);
        } catch (error) {
            throw createLoadError(source, error);
        }
    }
}

async function resolveImageSource(source) {
    if (typeof source === 'string') {
        const response = await fetch(source, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status} while loading map.`);
        return response.blob();
    }
    if (source instanceof Blob) return source;
    throw new TypeError('Heightmap source must be a URL, Blob, File, or ImageData.');
}

function isImageData(value) {
    return Boolean(value && Number.isSafeInteger(value.width) &&
        Number.isSafeInteger(value.height) && value.data);
}

function copyImageData(imageData) {
    return {
        width: imageData.width,
        height: imageData.height,
        pixels: new Uint8Array(imageData.data)
    };
}

function resolveImageLoad(image, resolve, reject) {
    image.onload = resolve;
    image.onerror = reject;
}

function createLoadError(source, error) {
    const label = typeof source === 'string' ? source : 'provided image data';
    return new Error(`Unable to decode topographic map ${label}: ${error.message}`, { cause: error });
}

export { BrowserHeightmapLoader };
