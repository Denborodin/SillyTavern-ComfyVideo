import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentModelRequest } from '../lib/current-model.js';
import { createPromptBuilder } from '../lib/prompt-builder.js';

test('current-model image and motion requests exclude later chat entries', async () => {
    const chat = [{ name: 'A', mes: 'BEFORE' }, { name: 'A', mes: 'REFERENCE' }, { name: 'A', mes: 'LATER SECRET' }];
    const controller = new AbortController();
    const requests = [];
    const builder = createPromptBuilder({
        getContext: () => ({ chat }),
        sendCurrentPrompt: async request => { requests.push(request); return { content: 'A valid prompt' }; },
    });
    const st = { promptMode: 'quiet', contextMessages: 1, includeCharacter: false, frames: 124, fps: 24 };
    await builder.buildImagePrompt(st, { targetMessage: chat[1], signal: controller.signal });
    await builder.buildMotionPrompt(st, { targetMessage: chat[1], signal: controller.signal });
    for (const request of requests) {
        const input = JSON.stringify(request.messages);
        assert.match(input, /REFERENCE/);
        assert.doesNotMatch(input, /BEFORE|LATER SECRET/);
        assert.equal(request.signal, controller.signal);
    }
});

test('current-model request snapshots settings and cancels only its own transport', async () => {
    const settings = { model: 'original', openai_max_tokens: 1 };
    const controller = new AbortController();
    let start;
    const started = new Promise(resolve => { start = resolve; });
    const request = createCurrentModelRequest({
        getContext: () => ({ mainApi: 'openai', chatCompletionSettings: settings,
            ChatCompletionService: { sendRequest: async (payload, extract, signal) => {
                assert.equal(payload.model, 'original');
                assert.equal(payload.max_tokens, 700);
                assert.equal(signal, controller.signal);
                start();
                return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
            } },
        }),
        getChatCompletionModel: st => st.model,
        createGenerationParameters: async st => {
            settings.model = 'changed';
            return { generate_data: { model: st.model, max_tokens: st.openai_max_tokens } };
        },
    });
    const pending = request({ messages: [], maxTokens: 700, signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await started;
    controller.abort();
    await rejected;
    assert.equal(settings.openai_max_tokens, 1);
});

test('provider-specific token fields are preserved', async () => {
    let sent;
    const request = createCurrentModelRequest({
        getContext: () => ({ mainApi: 'openai', chatCompletionSettings: {},
            ChatCompletionService: { sendRequest: async data => { sent = data; } } }),
        getChatCompletionModel: () => 'provider-model',
        createGenerationParameters: async st => ({ generate_data: { max_completion_tokens: st.openai_max_tokens } }),
    });
    await request({ messages: [], maxTokens: 700 });
    assert.equal(sent.max_completion_tokens, 700);
    assert.equal('max_tokens' in sent, false);
});

test('text completion receives isolated instructions and its own signal', async () => {
    const controller = new AbortController();
    const request = createCurrentModelRequest({
        getContext: () => ({ mainApi: 'textgenerationwebui', textCompletionSettings: { model: 'local' },
            powerUserSettings: { instruct: { enabled: true } },
            TextCompletionService: {
                constructPrompt: messages => messages.map(item => item.content).join('\n'),
                sendRequest: async (payload, extract, signal) => {
                    assert.equal(payload.prompt, 'selected context');
                    assert.equal(signal, controller.signal);
                    assert.equal(payload.stream, false);
                    return { content: 'generated prompt' };
                },
            },
        }),
        getTextGenModel: st => st.model,
        createTextGenGenerationData: (st, model, prompt, maxTokens) => ({ model, prompt, max_tokens: maxTokens }),
    });
    const result = await request({ messages: [{ role: 'user', content: 'selected context' }], maxTokens: 700, signal: controller.signal });
    assert.equal(result.content, 'generated prompt');
});
