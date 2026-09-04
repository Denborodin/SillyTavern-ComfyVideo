import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_CAST_CONTEXT_CHARS,
    MAX_MESSAGE_CHARS,
    MAX_ROLEPLAY_CONTEXT_CHARS,
    buildCastContext,
    collectRoleplayContext,
    isRoleplayMessage,
    messageSignature,
    resolveCastParticipants,
    resolveChatMessage,
    validateCastSelection,
} from '../lib/scene-context.js';

function groupContext(overrides = {}) {
    return {
        groupId: 'group-1',
        name1: 'Robert',
        groups: [{
            id: 'group-1',
            members: ['Alva.png', 'Stacy.png'],
            disabled_members: ['Stacy.png'],
            generation_mode: 1,
        }],
        characters: [
            { name: 'Alva', avatar: 'Alva.png', description: 'Silver hair and a blue coat.' },
            { name: 'Stacy', avatar: 'Stacy.png', description: 'Dark curls and a red jacket.' },
        ],
        powerUserSettings: { persona_description: 'Robert has short brown hair and round glasses.' },
        getCharacterCardFields: () => ({ persona: 'Robert has short brown hair and round glasses.' }),
        chat: [],
        ...overrides,
    };
}

test('resolves every current group member plus the user regardless of SWAP/disabled state', () => {
    const context = groupContext();
    const participants = resolveCastParticipants(context, []);
    assert.deepEqual(participants.map(item => item.id), ['npc:Alva.png', 'npc:Stacy.png', 'user']);
    assert.equal(participants.find(item => item.id === 'user').description.includes('round glasses'), true);
});

test('adds a historical speaker removed from the current group and keeps a missing card selectable', () => {
    const context = groupContext({
        groups: [{ id: 'group-1', members: ['Alva.png'], disabled_members: [] }],
        characters: [{ name: 'Alva', avatar: 'Alva.png', description: 'Silver hair.' }],
    });
    const participants = resolveCastParticipants(context, [
        { name: 'Stacy', mes: 'She returns.', original_avatar: 'Stacy.png', is_user: false },
    ]);
    const historical = participants.find(item => item.id === 'npc:Stacy.png');
    assert.equal(historical.label, 'Stacy');
    assert.equal(historical.missing, true);
});

test('assigns stable numbered labels to duplicate names', () => {
    const context = groupContext({
        groups: [{ id: 'group-1', members: ['one.png', 'two.png'], disabled_members: [] }],
        characters: [
            { name: 'Alex', avatar: 'one.png' },
            { name: 'Alex', avatar: 'two.png' },
        ],
        name1: 'Alex',
    });
    assert.deepEqual(
        resolveCastParticipants(context, []).map(item => item.label),
        ['Alex #1', 'Alex #2', 'Alex #3'],
    );
});

test('counts roleplay lines only and preserves narrator messages', () => {
    const chat = [
        { name: 'Alva', mes: 'First roleplay line.', original_avatar: 'Alva.png' },
        { name: 'ComfyVideo', mes: '*[ComfyVideo]* old prompt', is_system: true, extra: { comfyVideo: { source: 'ComfyVideo' } } },
        { name: 'ComfyVideo', mes: '*[ComfyVideo]* legacy prompt without metadata', is_system: false },
        { name: 'Tool', mes: 'tool output', is_system: true, extra: { tool_invocations: [{}] } },
        { name: 'Narrator', mes: 'Rain crosses the window.', is_system: true, extra: { type: 'narrator' } },
        { name: 'Robert', mes: 'Second roleplay line.', is_user: true },
        { name: 'System', mes: 'service notice', is_system: true },
    ];
    const result = collectRoleplayContext(groupContext({ chat }), 3);
    assert.equal(result.messages.length, 3);
    assert.match(result.text, /First roleplay line/);
    assert.match(result.text, /Rain crosses the window/);
    assert.match(result.text, /Second roleplay line/);
    assert.doesNotMatch(result.text, /old prompt|legacy prompt|tool output|service notice/);
});

test('a normal roleplay message stays roleplay after a ComfyVideo still is attached', () => {
    const message = {
        name: 'Alva',
        mes: 'She opens the door.',
        is_system: false,
        extra: { comfyVideo: { source: 'ComfyVideo' }, media: [{ url: '/still.png', comfyVideo: {} }] },
    };
    assert.equal(isRoleplayMessage(message), true);
});

test('message signature detects swipe, selected media and per-media recipe changes', () => {
    const message = {
        name: 'Alva',
        mes: 'A scene.',
        swipe_id: 0,
        extra: {
            media_index: 0,
            media: [{ url: '/one.png', comfyVideo: { imagePrompt: 'one', width: 864, height: 1152 } }],
        },
    };
    const original = messageSignature(message);
    message.extra.media[0].comfyVideo.imagePrompt = 'changed';
    assert.notEqual(messageSignature(message), original);
});

test('roleplay and cast context respect character budgets while retaining both ends', () => {
    const long = `START-${'x'.repeat(9000)}-END`;
    const chat = Array.from({ length: 8 }, (_, index) => ({ name: `Speaker ${index}`, mes: long }));
    const result = collectRoleplayContext(groupContext({ chat }), 8);
    assert.ok(result.text.length <= MAX_ROLEPLAY_CONTEXT_CHARS);
    assert.match(result.text, /START-/);
    assert.match(result.text, /-END/);
    for (const message of result.messages) {
        assert.ok(message.mes.length > MAX_MESSAGE_CHARS);
    }

    const participants = resolveCastParticipants(groupContext({
        characters: [
            { name: 'Alva', avatar: 'Alva.png', description: long },
            { name: 'Stacy', avatar: 'Stacy.png', description: long },
        ],
        powerUserSettings: { persona_description: long },
    }), []);
    const cast = buildCastContext(participants, { mode: 'auto', participantIds: [] }, true);
    assert.ok(cast.length <= MAX_CAST_CONTEXT_CHARS);
    assert.match(cast, /START-/);
    assert.match(cast, /-END/);
});

test('explicit and none cast blocks are strict', () => {
    const participants = resolveCastParticipants(groupContext(), []);
    const explicit = buildCastContext(participants, {
        mode: 'explicit',
        participantIds: ['npc:Alva.png', 'user'],
    }, true);
    assert.match(explicit, /exactly these visible characters: Alva, Robert/);
    assert.doesNotMatch(explicit, /Stacy — character/);

    const none = buildCastContext(participants, { mode: 'none', participantIds: [] }, true);
    assert.match(none, /Show no people/);
    assert.doesNotMatch(none, /Character references/);
});

test('cast validation follows composition rules', () => {
    const one = { mode: 'explicit', participantIds: ['user'] };
    const two = { mode: 'explicit', participantIds: ['user', 'npc:Alva.png'] };
    const none = { mode: 'none', participantIds: [] };
    assert.equal(validateCastSelection(one, 'portrait').valid, true);
    assert.equal(validateCastSelection(two, 'portrait').valid, false);
    assert.equal(validateCastSelection(two, 'interaction').valid, true);
    assert.equal(validateCastSelection(one, 'interaction').valid, false);
    assert.equal(validateCastSelection(none, 'environment').valid, true);
    assert.equal(validateCastSelection(none, 'scene').valid, false);
    assert.equal(validateCastSelection({ mode: 'auto', participantIds: [] }, 'interaction').valid, true);
});

test('roleplay context anchors at the selected mid-chat message and excludes later lines', () => {
    const chat = [
        { name: 'Alva', mes: 'Alva opens the door.', original_avatar: 'Alva.png' },
        { name: 'Robert', mes: 'Robert steps inside.', is_user: true },
        { name: 'Stacy', mes: 'Stacy freezes mid-step.', original_avatar: 'Stacy.png' },
        { name: 'Alva', mes: 'Alva pours tea later.', original_avatar: 'Alva.png' },
        { name: 'Robert', mes: 'Robert thanks her later.', is_user: true },
    ];
    const target = chat[2];
    const result = collectRoleplayContext(groupContext({ chat }), 5, target);
    assert.equal(result.targetIndex, 2);
    assert.equal(result.lastRoleplayIndex, 2);
    assert.match(result.text, /Stacy freezes mid-step/);
    assert.match(result.text, /Robert steps inside/);
    assert.doesNotMatch(result.text, /pours tea later|thanks her later/);
});

test('resolveChatMessage prefers live mesid over a stale closed-over object', () => {
    const chat = [
        { name: 'Alva', mes: 'Old line.', send_date: '1' },
        { name: 'Stacy', mes: 'Clicked line.', send_date: '2' },
        { name: 'Robert', mes: 'Latest line.', is_user: true, send_date: '3' },
    ];
    const stale = { name: 'Alva', mes: 'Old line.', send_date: '1' };
    const resolved = resolveChatMessage(chat, { id: 1, message: stale });
    assert.equal(resolved.id, 1);
    assert.equal(resolved.message.mes, 'Clicked line.');
});

test('resolveChatMessage can recover a replaced object via signature', () => {
    const original = { name: 'Alva', mes: 'She waits.', send_date: '9' };
    const replacement = { name: 'Alva', mes: 'She waits.', send_date: '9' };
    const chat = [
        { name: 'Robert', mes: 'Earlier.', is_user: true, send_date: '8' },
        replacement,
        { name: 'Stacy', mes: 'Later.', send_date: '10' },
    ];
    const resolved = resolveChatMessage(chat, {
        id: 99,
        message: original,
        signature: messageSignature(original),
    });
    assert.equal(resolved.id, 1);
    assert.equal(resolved.message, replacement);
});
