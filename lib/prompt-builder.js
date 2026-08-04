/**
 * Scene → image prompt builder.
 * Modes:
 *  - profile: ConnectionManagerRequestService (background, dedicated profile)
 *  - quiet: generateQuietPrompt on current main model
 *  - manual: no LLM
 * Never writes intermediate turns into the character chat.
 */

/**
 * @param {object} deps
 * @param {() => any} deps.getContext
 * @param {(opts: object) => Promise<string>} deps.generateQuietPrompt
 * @param {typeof import('../../shared.js').ConnectionManagerRequestService | null} deps.ConnectionManagerRequestService
 */
export function createPromptBuilder(deps) {
    const { getContext, generateQuietPrompt, ConnectionManagerRequestService } = deps;

    /**
     * Collect last N chat messages as plain text.
     * @param {number} n
     * @returns {string}
     */
    function collectRecentMessages(n) {
        const ctx = getContext();
        const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
        const slice = chat.slice(-Math.max(1, n || 5));
        return slice
            .map(m => {
                const name = m.name || (m.is_user ? 'User' : 'Character');
                const text = String(m.mes || '')
                    .replace(/<img[^>]*>/gi, '')
                    .replace(/!\[.*?\]\(.*?\)/g, '')
                    .trim();
                if (!text) return null;
                return `${name}: ${text}`;
            })
            .filter(Boolean)
            .join('\n\n');
    }

    /**
     * Optional character appearance / description snippet.
     * @returns {string}
     */
    function collectCharacterAppearance() {
        const ctx = getContext();
        try {
            const fields = typeof ctx.getCharacterCardFields === 'function'
                ? ctx.getCharacterCardFields()
                : null;
            if (fields) {
                const parts = [fields.description, fields.personality, fields.scenario]
                    .filter(Boolean)
                    .map(s => String(s).trim())
                    .filter(Boolean);
                if (parts.length) return parts.join('\n');
            }
        } catch {
            // ignore
        }
        const ch = ctx.characters?.[ctx.characterId];
        if (!ch) return '';
        return [ch.description, ch.personality, ch.scenario].filter(Boolean).join('\n');
    }

    /**
     * Build the user payload for the prompt-engineer LLM.
     * @param {object} settings
     * @returns {string}
     */
    function buildContextBlock(settings) {
        const recent = collectRecentMessages(settings.contextMessages);
        let block = `Recent chat (last ${settings.contextMessages} messages):\n\n${recent || '(empty)'}`;
        if (settings.includeCharacter) {
            const appearance = collectCharacterAppearance();
            if (appearance) {
                block = `Character appearance / card:\n${appearance}\n\n${block}`;
            }
        }
        return block;
    }

    /**
     * @param {object} settings ComfyVideo settings
     * @returns {Promise<string>} image prompt
     */
    async function buildImagePrompt(settings) {
        if (settings.promptMode === 'manual') {
            return String(settings.manualImagePrompt || '').trim();
        }

        const template = String(settings.imagePromptTemplate || '').trim()
            || 'You are an expert image prompt engineer. Write a single detailed image generation prompt for the current scene. Output only the prompt, no quotes or commentary.';
        const contextBlock = buildContextBlock(settings);
        const userContent = `${template}\n\n---\n\n${contextBlock}\n\n---\n\nWrite the image prompt now:`;

        if (settings.promptMode === 'profile') {
            if (!ConnectionManagerRequestService) {
                throw new Error('Connection Manager is not available. Switch prompt mode to Quiet or Manual.');
            }
            if (!settings.llmProfileId) {
                throw new Error('Select an LLM connection profile in ComfyVideo settings (prompt mode: Profile).');
            }
            const maxTokens = Number(settings.maxPromptTokens) || 400;
            const result = await ConnectionManagerRequestService.sendRequest(
                settings.llmProfileId,
                [
                    { role: 'system', content: template },
                    { role: 'user', content: contextBlock + '\n\nWrite the image prompt now. Output only the prompt.' },
                ],
                maxTokens,
                { extractData: true, stream: false },
            );
            const text = extractText(result);
            if (!text) throw new Error('LLM returned an empty image prompt.');
            return cleanPrompt(text);
        }

        // quiet (default fallback)
        const reply = await generateQuietPrompt({ quietPrompt: userContent });
        if (!reply?.trim()) {
            throw new Error('Quiet prompt generation returned empty text.');
        }
        return cleanPrompt(reply);
    }

    /**
     * @param {object} settings
     * @returns {Promise<string>}
     */
    async function buildMotionPrompt(settings) {
        if (settings.motionPromptMode === 'fixed' || settings.motionPromptMode === 'ask') {
            // ask is handled by UI before calling; fixed uses setting
            return String(settings.fixedMotionPrompt || 'subtle natural movement, gentle camera motion').trim();
        }

        // auto
        if (settings.promptMode === 'profile' && ConnectionManagerRequestService && settings.llmProfileId) {
            const contextBlock = buildContextBlock(settings);
            const result = await ConnectionManagerRequestService.sendRequest(
                settings.llmProfileId,
                [
                    {
                        role: 'system',
                        content: 'You write short motion prompts for image-to-video. Output one line only: camera and subject motion, no style essay.',
                    },
                    {
                        role: 'user',
                        content: `${contextBlock}\n\nMotion prompt:`,
                    },
                ],
                80,
                { extractData: true, stream: false },
            );
            const text = extractText(result);
            if (text) return cleanPrompt(text);
        }

        return String(settings.fixedMotionPrompt || 'subtle natural movement, gentle camera motion').trim();
    }

    function extractText(result) {
        if (result == null) return '';
        if (typeof result === 'string') return result;
        // ConnectionManagerRequestService with extractData:true → { content, reasoning }
        if (typeof result === 'object') {
            if (typeof result.content === 'string') return result.content;
            if (typeof result.text === 'string') return result.text;
            if (Array.isArray(result.choices) && result.choices[0]?.message?.content) {
                return result.choices[0].message.content;
            }
        }
        return String(result);
    }

    function cleanPrompt(text) {
        return String(text)
            .replace(/<\/?think(?:ing)?[^>]*>/gi, ' ')
            .replace(/^["'\s]+|["'\s]+$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    return {
        collectRecentMessages,
        collectCharacterAppearance,
        buildContextBlock,
        buildImagePrompt,
        buildMotionPrompt,
    };
}
