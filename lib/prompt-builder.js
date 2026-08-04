/**
 * Scene → image / motion prompt builder (always LLM for motion).
 * Profile mode ignores completion preset by default.
 */

import {
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_MOTION_PROMPT_TEMPLATE,
    DEFAULT_FIXED_MOTION_FALLBACK,
    applyClipPlaceholders,
    clipTiming,
} from './defaults.js';

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
        let block = `Recent roleplay (last ${settings.contextMessages} messages):\n\n${recent || '(empty)'}`;
        if (settings.includeCharacter) {
            const appearance = collectCharacterAppearance();
            if (appearance) {
                block = `Character appearance / card (keep consistent):\n${appearance}\n\n${block}`;
            }
        }
        return block;
    }

    function llmOptions(settings, signal) {
        return {
            extractData: true,
            stream: false,
            includePreset: !!settings.useLlmPreset,
            includeInstruct: !!settings.useLlmPreset,
            signal,
        };
    }

    /**
     * @param {object} settings
     * @param {AbortSignal} [signal]
     */
    async function buildImagePrompt(settings, signal) {
        const template = String(settings.imagePromptTemplate || '').trim() || DEFAULT_IMAGE_PROMPT_TEMPLATE;
        const contextBlock = buildContextBlock(settings);
        const mode = settings.promptMode === 'quiet' ? 'quiet' : 'profile';

        if (mode === 'profile') {
            if (!ConnectionManagerRequestService) {
                throw new Error('Connection Manager is not available. Switch prompt mode to Quiet.');
            }
            if (!settings.llmProfileId) {
                throw new Error('Select an LLM connection profile in ComfyVideo settings.');
            }
            const maxTokens = Number(settings.maxPromptTokens) || 400;
            const result = await ConnectionManagerRequestService.sendRequest(
                settings.llmProfileId,
                [
                    { role: 'system', content: template },
                    {
                        role: 'user',
                        content: contextBlock +
                            '\n\nWrite the image prompt for this roleplay moment. ' +
                            'Focus on appearance, clothing, positions, and actions. Output only the prompt.',
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
        if (!reply?.trim()) throw new Error('Quiet prompt generation returned empty text.');
        return cleanPrompt(reply);
    }

    /**
     * Always uses LLM. Clip length (seconds) is injected into the instruction template.
     * @param {object} settings
     * @param {object} [opts]
     * @param {string} [opts.sourceImagePrompt] still prompt from message metadata
     * @param {AbortSignal} [opts.signal]
     */
    async function buildMotionPrompt(settings, opts = {}) {
        const { sourceImagePrompt = '', signal } = opts;
        const rawTemplate = String(settings.motionPromptTemplate || '').trim() || DEFAULT_MOTION_PROMPT_TEMPLATE;
        const template = applyClipPlaceholders(rawTemplate, settings.frames, settings.fps);
        const { seconds, motionLines } = clipTiming(settings.frames, settings.fps);
        const contextBlock = buildContextBlock(settings);
        const mode = settings.promptMode === 'quiet' ? 'quiet' : 'profile';

        let userBody = contextBlock;
        userBody += `\n\nClip length: ${seconds}s (~${motionLines} motion lines).`;
        if (sourceImagePrompt) {
            userBody += `\n\nSource still image prompt (motion must fit this moment):\n${sourceImagePrompt}`;
        }
        userBody += '\n\nWrite the motion prompt now. Output only the motion text.';

        try {
            if (mode === 'profile') {
                if (!ConnectionManagerRequestService) {
                    throw new Error('Connection Manager is not available.');
                }
                if (!settings.llmProfileId) {
                    throw new Error('Select an LLM connection profile for motion prompts.');
                }
                const maxTokens = Math.min(Math.max(Number(settings.maxPromptTokens) || 400, 80), 600);
                const result = await ConnectionManagerRequestService.sendRequest(
                    settings.llmProfileId,
                    [
                        { role: 'system', content: template },
                        { role: 'user', content: userBody },
                    ],
                    maxTokens,
                    llmOptions(settings, signal),
                );
                const text = extractText(result);
                if (!text) throw new Error('LLM returned an empty motion prompt.');
                return cleanPrompt(text);
            }

            const reply = await generateQuietPrompt({
                quietPrompt: `${template}\n\n---\n\n${userBody}`,
            });
            if (!reply?.trim()) throw new Error('Quiet motion prompt generation returned empty text.');
            return cleanPrompt(reply);
        } catch (e) {
            // Last resort so I2V is not hard-blocked if LLM fails mid-session
            console.warn('[ComfyVideo] Motion LLM failed, using short fallback', e);
            throw e;
        }
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
        s = s.replace(/^(here(?:'s| is) (?:the )?(?:image |motion )?prompt[:\s]*)/i, '').trim();
        return s;
    }

    return {
        collectRecentMessages,
        collectCharacterAppearance,
        buildContextBlock,
        buildImagePrompt,
        buildMotionPrompt,
        DEFAULT_FIXED_MOTION_FALLBACK,
    };
}
