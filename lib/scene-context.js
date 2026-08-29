/**
 * Group-aware roleplay context and cast helpers.
 * Kept free of DOM/runtime dependencies so the behavior can be unit tested.
 */

export const MAX_CAST_SELECTION = 3;
export const MAX_MESSAGE_CHARS = 6000;
export const MAX_ROLEPLAY_CONTEXT_CHARS = 24000;
export const MAX_CAST_ENTRY_CHARS = 4000;
export const MAX_CAST_CONTEXT_CHARS = 12000;

/** @returns {{mode:'auto'|'explicit'|'none', participantIds:string[]}} */
export function normalizeCastSelection(value) {
    const mode = ['auto', 'explicit', 'none'].includes(value?.mode) ? value.mode : 'auto';
    if (mode !== 'explicit') return { mode, participantIds: [] };
    const participantIds = [...new Set((Array.isArray(value?.participantIds) ? value.participantIds : [])
        .map(String)
        .filter(Boolean))].slice(0, MAX_CAST_SELECTION);
    return participantIds.length
        ? { mode: 'explicit', participantIds }
        : { mode: 'none', participantIds: [] };
}

/** @returns {{valid:boolean, message:string}} */
export function validateCastSelection(value, promptKind = 'scene') {
    const selection = normalizeCastSelection(value);
    if (selection.mode === 'auto') return { valid: true, message: '' };
    const count = selection.mode === 'none' ? 0 : selection.participantIds.length;

    if (promptKind === 'portrait' && count !== 1) {
        return { valid: false, message: 'Portrait requires exactly one character.' };
    }
    if (promptKind === 'interaction' && (count < 2 || count > 3)) {
        return { valid: false, message: 'Interaction requires two or three characters.' };
    }
    if (promptKind === 'environment') {
        return count <= MAX_CAST_SELECTION
            ? { valid: true, message: '' }
            : { valid: false, message: 'Select no more than three characters.' };
    }
    if (count < 1 || count > MAX_CAST_SELECTION) {
        return { valid: false, message: 'Whole scene requires one to three characters.' };
    }
    return { valid: true, message: '' };
}

export function isComfyVideoMessage(message) {
    if (message?.extra?.comfyVideo?.source === 'ComfyVideo') return true;
    if (/^\s*\*?\[ComfyVideo\]/i.test(String(message?.mes || ''))) return true;
    return Array.isArray(message?.extra?.media)
        && message.extra.media.some(item => item?.comfyVideo);
}

export function isRoleplayMessage(message) {
    if (!message) return false;
    if (/^\s*\*?\[ComfyVideo\]/i.test(String(message.mes || ''))) return false;
    if (message.is_system && isComfyVideoMessage(message)) return false;
    if (Array.isArray(message.extra?.tool_invocations) || Array.isArray(message.extra?.tool_calls)) return false;
    if (message.extra?.type === 'tool' || message.extra?.type === 'tool_call') return false;
    if (message.is_system && message.extra?.type !== 'narrator') return false;
    return Boolean(String(message.mes || '').trim());
}

export function truncateContextText(value, maxChars) {
    const text = String(value || '');
    if (text.length <= maxChars) return text;
    if (maxChars <= 32) return text.slice(0, Math.max(0, maxChars));
    const marker = '\n[…truncated…]\n';
    const available = Math.max(0, maxChars - marker.length);
    const head = Math.floor(available * 0.45);
    const tail = available - head;
    return `${text.slice(0, head)}${marker}${text.slice(-tail)}`;
}

function cleanMessageText(value) {
    return String(value || '')
        .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, ' ')
        .replace(/<(?:img|video|audio|source)\b[^>]*>/gi, ' ')
        .replace(/!\[[^\]]*]\([^\n)]*(?:\)[^\n)]*)?\)/g, ' ')
        .replace(/<\/?(?:div|p|span|details|summary)\b[^>]*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSpeakerName(value, fallback) {
    const name = String(value || fallback || 'Character')
        .replace(/[\r\n:]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return name || fallback || 'Character';
}

/**
 * Collect the configured number of usable roleplay messages, not raw chat rows.
 */
export function collectRoleplayContext(context, count = 5, targetMessage = null) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const requested = Math.max(1, Number(count) || 5);
    const targetIndex = targetMessage == null ? chat.length - 1 : chat.indexOf(targetMessage);
    if (targetIndex < 0) {
        return { text: '', messages: [], targetIndex: -1, lastRoleplayIndex: -1 };
    }

    const collected = [];
    for (let index = targetIndex; index >= 0 && collected.length < requested; index--) {
        const message = chat[index];
        if (!isRoleplayMessage(message)) continue;
        const rawText = cleanMessageText(message.mes);
        if (!rawText) continue;
        collected.push({
            message,
            index,
            name: normalizeSpeakerName(message.name, message.is_user ? context?.name1 || 'User' : 'Character'),
            text: truncateContextText(rawText, MAX_MESSAGE_CHARS),
        });
    }
    collected.reverse();

    // Prefer the most recent entries if the aggregate budget is exceeded.
    const budgeted = [];
    let remaining = MAX_ROLEPLAY_CONTEXT_CHARS;
    for (let i = collected.length - 1; i >= 0 && remaining > 0; i--) {
        const item = collected[i];
        const prefix = `${item.name}: `;
        if (prefix.length >= remaining) break;
        const text = truncateContextText(item.text, remaining - prefix.length);
        budgeted.push({ ...item, formatted: `${prefix}${text}` });
        remaining -= prefix.length + text.length + 2;
    }
    budgeted.reverse();

    return {
        text: budgeted.map(item => item.formatted).join('\n\n'),
        messages: budgeted.map(item => item.message),
        targetIndex,
        lastRoleplayIndex: budgeted.at(-1)?.index ?? -1,
    };
}

function rawCharacterDescription(character) {
    const description = character?.data?.description ?? character?.description ?? '';
    const personality = character?.data?.personality ?? character?.personality ?? '';
    return [description, personality]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join('\n\nPersonality cues: ');
}

function getPersonaDescription(context) {
    const direct = context?.powerUserSettings?.persona_description;
    if (String(direct || '').trim()) return String(direct).trim();
    try {
        const fields = context?.getCharacterCardFields?.();
        if (String(fields?.persona || '').trim()) return String(fields.persona).trim();
    } catch {
        // A group may not have an active character yet.
    }
    return '';
}

/**
 * Resolve the current group plus historical speakers in the selected context.
 */
export function resolveCastParticipants(context, messages = []) {
    const participants = [];
    const byId = new Map();
    const characters = Array.isArray(context?.characters) ? context.characters : [];

    const addNpc = (avatar, fallbackName = '') => {
        if (!avatar) return;
        const id = `npc:${avatar}`;
        if (byId.has(id)) return;
        const character = characters.find(item => item?.avatar === avatar);
        const participant = {
            id,
            role: 'npc',
            name: normalizeSpeakerName(character?.name || fallbackName, 'Character'),
            label: '',
            avatar,
            avatarUrl: `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`,
            description: rawCharacterDescription(character),
            missing: !character,
        };
        byId.set(id, participant);
        participants.push(participant);
    };

    if (context?.groupId) {
        const group = Array.isArray(context.groups)
            ? context.groups.find(item => String(item?.id) === String(context.groupId))
            : null;
        for (const avatar of Array.isArray(group?.members) ? group.members : []) addNpc(avatar);
    } else {
        const character = characters[context?.characterId];
        if (character?.avatar) addNpc(character.avatar, character.name);
    }

    for (const message of messages) {
        if (!message?.is_user && message?.original_avatar) {
            addNpc(message.original_avatar, message.name);
        }
    }

    const recentUser = [...messages].reverse().find(message => message?.is_user);
    const user = {
        id: 'user',
        role: 'user',
        name: normalizeSpeakerName(context?.name1, 'User'),
        label: '',
        avatar: '',
        avatarUrl: String(recentUser?.force_avatar || ''),
        description: getPersonaDescription(context),
        missing: false,
    };
    byId.set(user.id, user);
    participants.push(user);

    const nameCounts = new Map();
    for (const participant of participants) {
        const key = participant.name.toLocaleLowerCase();
        nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    }
    const seenNames = new Map();
    for (const participant of participants) {
        const key = participant.name.toLocaleLowerCase();
        const next = (seenNames.get(key) || 0) + 1;
        seenNames.set(key, next);
        participant.label = nameCounts.get(key) > 1 ? `${participant.name} #${next}` : participant.name;
    }
    return participants;
}

/**
 * Build mandatory cast constraints plus optional per-character reference cards.
 */
export function buildCastContext(participants, selectionValue, includeReferences = true) {
    const selection = normalizeCastSelection(selectionValue);
    const byId = new Map((participants || []).map(item => [item.id, item]));
    const selected = selection.mode === 'explicit'
        ? selection.participantIds.map(id => byId.get(id)).filter(Boolean)
        : [];

    let constraint;
    let references;
    if (selection.mode === 'none') {
        constraint = 'CAST CONSTRAINT (mandatory): Show no people or human figures in frame.';
        references = [];
    } else if (selection.mode === 'explicit') {
        const labels = selected.map(item => item.label).join(', ') || '(none)';
        constraint = `CAST CONSTRAINT (mandatory): Include exactly these visible characters: ${labels}. Do not add any other people or characters.`;
        references = selected;
    } else {
        constraint = 'CAST MODE: Infer who is visible from the roleplay. Group membership is reference only; do not put a character in frame merely because a card is listed.';
        references = participants || [];
    }

    if (!includeReferences || references.length === 0) return constraint;
    const prefix = `${constraint}\n\nCharacter references (identity and appearance only):\n`;
    const blocks = [];
    let remaining = Math.max(0, MAX_CAST_CONTEXT_CHARS - prefix.length);
    for (const participant of references) {
        const role = participant.role === 'user' ? 'user persona' : 'character';
        const heading = `[${participant.label} — ${role}]`;
        const description = String(participant.description || '').trim() || '(appearance card unavailable; use roleplay context only)';
        const block = `${heading}\n${truncateContextText(description, MAX_CAST_ENTRY_CHARS)}`;
        if (block.length > remaining) {
            if (remaining > heading.length + 32) blocks.push(truncateContextText(block, remaining));
            break;
        }
        blocks.push(block);
        remaining -= block.length + 2;
    }
    return `${prefix}${blocks.join('\n\n')}`;
}

export function findLastRoleplayMessage(chat) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (isRoleplayMessage(chat[i])) return chat[i];
    }
    return null;
}

export function messageSignature(message) {
    if (!message) return '';
    const mediaIndex = message.extra?.media_index ?? null;
    const selectedIndex = Number(mediaIndex);
    const selectedMedia = mediaIndex != null && Number.isInteger(selectedIndex)
        ? message.extra?.media?.[selectedIndex]
        : null;
    return JSON.stringify({
        name: message.name || '',
        mes: message.mes || '',
        sendDate: message.send_date || '',
        swipeId: message.swipe_id ?? null,
        mediaIndex,
        mediaUrl: selectedMedia?.url || '',
        mediaPrompt: selectedMedia?.comfyVideo?.imagePrompt || '',
        mediaWidth: selectedMedia?.comfyVideo?.width ?? null,
        mediaHeight: selectedMedia?.comfyVideo?.height ?? null,
    });
}
