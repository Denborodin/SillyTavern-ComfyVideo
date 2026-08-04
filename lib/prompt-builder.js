/**
 * Scene → image prompt builder.
 * Profile mode ignores completion preset by default (useLlmPreset to opt in).
 * Never writes intermediate turns into the character chat.
 */

const IMAGE_SYSTEM =
    'You are an expert image prompt engineer. ' +
    'From the scene context, write ONE detailed image generation prompt covering composition, characters, pose, clothing, ' +
    'expression, lighting, environment, and camera. ' +
    'Output ONLY the prompt text. No preamble, no quotes, no bullet lists, no “masterpiece / best quality / score_9” tag dumps ' +
    'unless those words are clearly required by the scene.';

/**
 * @param {object} deps
 * @param {() => any} deps.getContext
 * @param {(opts: object) => Promise<string>} deps.generateQuietPrompt
 * @param {typeof import('../../shared.js').ConnectionManagerRequestService | null} deps.ConnectionManagerRequestService
 */
export function createPromptBuilder(deps) {
    const { getContext, generateQuietPrompt, ConnectionManagerRequestService } = deps;

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

    function llmOptions(settings, signal) {
        return {
            extractData: true,
            stream: false,
            // Default: ignore completion preset / instruct so RP presets do not pollute image prompts
            includePreset: !!settings.useLlmPreset,
            includeInstruct: !!settings.useLlmPreset,
            signal,
        };
    }

    /**
     * @param {object} settings
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>}
     */
    async function buildImagePrompt(settings, signal) {
        if (settings.promptMode === 'manual') {
            return String(settings.manualImagePrompt || '').trim();
        }

        const template = String(settings.imagePromptTemplate || '').trim() || IMAGE_SYSTEM;
        const contextBlock = buildContextBlock(settings);

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
                    {
                        role: 'user',
                        content: contextBlock + '\n\nWrite the image prompt now. Output only the prompt text.',
                    },
                ],
                maxTokens,
                llmOptions(settings, signal),
            );
            const text = extractText(result);
            if (!text) throw new Error('LLM returned an empty image prompt.');
            return cleanPrompt(text);
        }

        const userContent = `${template}\n\n---\n\n${contextBlock}\n\n---\n\nWrite the image prompt now:`;
        const reply = await generateQuietPrompt({ quietPrompt: userContent });
        if (!reply?.trim()) {
            throw new Error('Quiet prompt generation returned empty text.');
        }
        return cleanPrompt(reply);
    }

    /**
     * @param {object} settings
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>}
     */
    async function buildMotionPrompt(settings, signal) {
        if (settings.motionPromptMode === 'fixed' || settings.motionPromptMode === 'ask') {
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
                        content: 'You write short motion prompts for image-to-video. Output one line only: camera and subject motion. No quality tags or style essays.',
                    },
                    {
                        role: 'user',
                        content: `${contextBlock}\n\nMotion prompt:`,
                    },
                ],
                80,
                llmOptions(settings, signal),
            );
            const text = extractText(result);
            if (text) return cleanPrompt(text);
        }

        return String(settings.fixedMotionPrompt || 'subtle natural movement, gentle camera motion').trim();
    }

    function extractText(result) {
        if (result == null) return '';
        if (typeof result === 'string') return result;
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
        let s = String(text)
            .replace(/<\/?think(?:ing)?[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, ' ')
            .replace(/<\/?think(?:ing)?[^>]*>/gi, ' ')
            .replace(/^["'`\s]+|["'`\s]+$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Drop common boilerplate lead-ins
        s = s.replace(/^(here(?:'s| is) (?:the )?(?:image |motion )?prompt[:\s]*)/i, '').trim();
        return s;
    }

    return {
        collectRecentMessages,
        collectCharacterAppearance,
        buildContextBlock,
        buildImagePrompt,
        buildMotionPrompt,
        IMAGE_SYSTEM,
    };
}
