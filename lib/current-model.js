/** Isolated requests to the current model, without the host's chat history. */
export function createCurrentModelRequest({ getContext, createGenerationParameters, getChatCompletionModel,
    createTextGenGenerationData, getTextGenModel }) {
    return async ({ messages, maxTokens, signal }) => {
        signal?.throwIfAborted();
        const ctx = getContext();
        if (ctx.mainApi === 'openai') {
            const settings = structuredClone(ctx.chatCompletionSettings);
            settings.openai_max_tokens = maxTokens;
            settings.stream_openai = false;
            const model = getChatCompletionModel(settings);
            const { generate_data: payload } = await createGenerationParameters(settings, model, 'quiet', messages);
            signal?.throwIfAborted();
            // Keep provider-specific token fields produced by the host (e.g. max_completion_tokens).
            return ctx.ChatCompletionService.sendRequest({ ...payload, stream: false }, true, signal);
        }
        if (ctx.mainApi === 'textgenerationwebui') {
            const settings = structuredClone(ctx.textCompletionSettings);
            const instruct = structuredClone(ctx.powerUserSettings?.instruct || {});
            const prompt = instruct.enabled
                ? ctx.TextCompletionService.constructPrompt(messages, instruct)
                : messages.map(item => `${item.role}: ${item.content}`).join('\n\n');
            const payload = createTextGenGenerationData(settings, getTextGenModel(settings), prompt, maxTokens);
            signal?.throwIfAborted();
            return ctx.TextCompletionService.sendRequest({ ...payload, stream: false }, true, signal);
        }
        throw new Error('Isolated current-model prompts require Chat Completion or Text Completion. Select a ComfyVideo connection profile for this backend.');
    };
}
