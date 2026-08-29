/** Resolve the selected still and its matching per-media generation recipe. */
export function getMessageImageSource(message) {
    const media = Array.isArray(message?.extra?.media) ? message.extra.media : [];
    const selectedIndex = Number(message?.extra?.media_index);
    const isStill = item => {
        if (!item?.url) return false;
        const type = String(item.type || '').toLowerCase();
        return type !== 'video' && type !== 'audio';
    };

    let mediaIndex = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < media.length
        && isStill(media[selectedIndex])
        ? selectedIndex
        : -1;
    if (mediaIndex < 0) {
        for (let i = media.length - 1; i >= 0; i--) {
            if (isStill(media[i])) {
                mediaIndex = i;
                break;
            }
        }
    }

    if (mediaIndex >= 0) {
        const item = media[mediaIndex];
        const itemMeta = item.comfyVideo && typeof item.comfyVideo === 'object'
            ? item.comfyVideo
            : null;
        return {
            url: item.url,
            mediaIndex,
            meta: itemMeta || message?.extra?.comfyVideo || {},
            media: item,
        };
    }

    if (message?.extra?.image) {
        return {
            url: message.extra.image,
            mediaIndex: -1,
            meta: message?.extra?.comfyVideo || {},
            media: null,
        };
    }
    return null;
}
