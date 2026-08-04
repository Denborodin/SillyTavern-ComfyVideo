/**
 * Chat media attach helpers for ComfyVideo.
 */

import { MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE, SCROLL_BEHAVIOR, VIDEO_EXTENSIONS } from '../../../../constants.js';

/**
 * @param {string} format file extension without dot
 * @returns {boolean}
 */
export function isVideoFormat(format) {
    return VIDEO_EXTENSIONS.includes(String(format || '').trim().toLowerCase());
}

/**
 * @param {object} opts
 * @param {any} opts.context getContext()
 * @param {string} opts.url saved media path/url
 * @param {string} opts.format
 * @param {string} opts.prompt
 * @param {object} opts.meta comfyVideo metadata
 * @param {'last'|'new'} opts.attachMode
 * @param {(msg: any, el: any, behavior: any) => void} opts.appendMediaToMessage
 * @param {any} opts.eventSource
 * @param {any} opts.event_types
 * @param {() => string} opts.getMessageTimeStamp
 * @param {string} opts.systemUserName
 */
export async function attachGeneratedMedia(opts) {
    const {
        context,
        url,
        format,
        prompt,
        meta,
        attachMode,
        appendMediaToMessage,
        eventSource,
        event_types,
        getMessageTimeStamp,
        systemUserName,
    } = opts;

    const mediaType = isVideoFormat(format) ? MEDIA_TYPE.VIDEO : MEDIA_TYPE.IMAGE;
    /** @type {any} */
    const mediaAttachment = {
        url,
        type: mediaType,
        title: prompt || 'ComfyVideo',
        source: MEDIA_SOURCE.GENERATED,
        comfyVideo: true,
    };

    if (attachMode === 'last' && context.chat?.length) {
        const messageId = context.chat.length - 1;
        const message = context.chat[messageId];
        if (!message.extra || typeof message.extra !== 'object') {
            message.extra = {};
        }
        if (!Array.isArray(message.extra.media)) {
            message.extra.media = [];
        }
        if (!message.extra.media.length && !message.extra.media_display) {
            message.extra.media_display = MEDIA_DISPLAY.GALLERY;
        }
        message.extra.media.push(mediaAttachment);
        message.extra.media_index = message.extra.media.length - 1;
        message.extra.comfyVideo = {
            ...(message.extra.comfyVideo || {}),
            ...meta,
            source: 'ComfyVideo',
        };

        const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageElement && appendMediaToMessage) {
            appendMediaToMessage(message, messageElement, SCROLL_BEHAVIOR.KEEP);
        } else if (typeof context.updateMessageBlock === 'function') {
            context.updateMessageBlock(messageId, message);
        }
        await context.saveChat();
        return { messageId, message };
    }

    // new message
    const name = context.groupId ? systemUserName : (context.name2 || 'ComfyVideo');
    /** @type {any} */
    const message = {
        name,
        is_user: false,
        is_system: true,
        send_date: getMessageTimeStamp(),
        mes: prompt ? `*[ComfyVideo]* ${prompt}` : '*[ComfyVideo]*',
        extra: {
            media: [mediaAttachment],
            media_display: MEDIA_DISPLAY.GALLERY,
            media_index: 0,
            inline_image: false,
            comfyVideo: {
                ...meta,
                source: 'ComfyVideo',
            },
        },
    };

    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'extension');
    context.addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await context.saveChat();
    if (typeof context.scrollOnMediaLoad === 'function') {
        setTimeout(() => context.scrollOnMediaLoad(), 100);
    }
    return { messageId, message };
}

/**
 * Attach video onto a specific message (same-message I2V).
 */
export async function attachVideoToMessage(opts) {
    const {
        context,
        messageId,
        url,
        format,
        prompt,
        meta,
        appendMediaToMessage,
    } = opts;

    const message = context.chat[messageId];
    if (!message) throw new Error('Message not found for video attach.');

    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }
    if (!Array.isArray(message.extra.media)) {
        message.extra.media = [];
    }
    if (!message.extra.media_display) {
        message.extra.media_display = MEDIA_DISPLAY.GALLERY;
    }

    message.extra.media.push({
        url,
        type: isVideoFormat(format) ? MEDIA_TYPE.VIDEO : MEDIA_TYPE.IMAGE,
        title: prompt || 'ComfyVideo I2V',
        source: MEDIA_SOURCE.GENERATED,
        comfyVideo: true,
    });
    message.extra.media_index = message.extra.media.length - 1;
    message.extra.comfyVideo = {
        ...(message.extra.comfyVideo || {}),
        ...meta,
        hasVideo: true,
        source: 'ComfyVideo',
    };

    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (messageElement && appendMediaToMessage) {
        appendMediaToMessage(message, messageElement, SCROLL_BEHAVIOR.KEEP);
    } else if (typeof context.updateMessageBlock === 'function') {
        context.updateMessageBlock(messageId, message);
    }
    await context.saveChat();
    return message;
}

/**
 * Find best source image URL on a message for I2V.
 * @param {any} message
 * @returns {string|null}
 */
export function getMessageImageUrl(message) {
    const media = message?.extra?.media;
    if (Array.isArray(media) && media.length) {
        const idx = message.extra.media_index ?? media.length - 1;
        // Prefer image type for conditioning
        const images = media.filter(m => m && m.url && m.type !== MEDIA_TYPE.VIDEO && m.type !== 'video');
        if (images.length) {
            const preferred = images[images.length - 1];
            return preferred.url;
        }
        const m = media[idx] || media[media.length - 1];
        if (m?.url) return m.url;
    }
    // legacy single image
    if (message?.extra?.image) return message.extra.image;
    return null;
}

export function isComfyVideoMessage(message) {
    if (message?.extra?.comfyVideo?.source === 'ComfyVideo') return true;
    if (Array.isArray(message?.extra?.media)) {
        return message.extra.media.some(m => m?.comfyVideo);
    }
    return false;
}
