/** Explicit workflow profiles; imported graphs are never guessed from filenames. */
export const IMAGE_MODEL_PROFILES = Object.freeze({
    generic: {
        name: 'Custom / generic',
        portraitSizes: [[864, 1152], [1296, 1728], [1728, 2304]],
        guidance: 'Use concrete natural-language descriptions of the finished image.',
    },
    zit: {
        name: 'Z-Image Turbo',
        portraitSizes: [[768, 1024], [864, 1152], [1104, 1472]],
        guidance: 'Lead with the main visible subjects and frozen action. Group each subject with its own appearance and pose, then describe spatial relationships, surroundings and light. Describe desired visible features positively.',
    },
    krea: {
        name: 'Krea 2 Turbo',
        portraitSizes: [[864, 1152], [1056, 1408], [1200, 1600]],
        guidance: 'Use cohesive natural-language descriptions. Integrate the chosen medium, colors, materials, textures, composition and lighting into the scene. Keep details grounded in the supplied context; do not invent props or clothing to embellish it.',
    },
    moss: {
        name: 'MOSS-Image SFT',
        portraitSizes: [[864, 1152], [1056, 1408], [1200, 1600]],
        guidance: 'Write a caption of the finished picture, rather than a request to draw or generate it. State object counts, positions, depth, ownership and contact points clearly. This workflow accepts a natural-language caption, not layout JSON or tag sequences.',
    },
});

const BUNDLED_IMAGE_PROFILES = Object.freeze({
    'builtin.image.z-image-turbo': 'zit',
    'builtin.image.krea-2-turbo': 'krea',
    'builtin.image.krea-2-turbo-standard': 'krea',
    'builtin.image.moss-image-sft': 'moss',
});

export function getWorkflowImageProfile(entry) {
    if (Object.hasOwn(IMAGE_MODEL_PROFILES, entry?.imageProfile)) return entry.imageProfile;
    return BUNDLED_IMAGE_PROFILES[entry?.source?.bundledId] || 'generic';
}

export function resolveImageProfile(settings) {
    return getWorkflowImageProfile(settings.libraries?.imageWorkflows
        ?.find(entry => entry.id === settings.activeImageWorkflowId));
}

const IMAGE_STYLE_PROMPTS = Object.freeze({
    photo: 'Photorealistic cinematic imagery, natural adult anatomy, credible skin texture, realistic practical lighting, detailed environment, coherent depth and perspective.',
    digital_art: 'Realistic digital illustration with subtle texture, natural materials, rich but restrained color, believable adult anatomy, expressive lighting, and coherent depth and perspective.',
    western_comic: 'Detailed Western graphic-novel art, realistic adult proportions, expressive natural faces, controlled ink contours, layered painted shading, textured brushwork, cinematic panel composition, no anime or manga styling.',
});

export function resolveVisualStyle(settings) {
    return settings.imageStylePreset === 'custom'
        ? String(settings.customImageStyle || '').trim()
        : (IMAGE_STYLE_PROMPTS[settings.imageStylePreset] || '');
}

export function imageRenderInstructions(settings, profile, dimensions) {
    const model = IMAGE_MODEL_PROFILES[profile] || IMAGE_MODEL_PROFILES.generic;
    const style = resolveVisualStyle(settings);
    const orientation = dimensions.width > dimensions.height ? 'landscape' : 'portrait';
    return `[Image render settings]\nTarget model: ${model.name}.\nCanvas: ${dimensions.width} x ${dimensions.height} pixels, ${orientation}.\n`
        + (style ? `Selected visual style: ${style}\n` : '')
        + `${model.guidance}\n`
        + 'Keep the selected composition and cast constraints. Fit the composition to this canvas. '
        + (style ? 'Use the selected visual style throughout the description, replacing conflicting medium or rendering cues in the instructions above. Integrate it into the prompt rather than appending a separate style instruction. ' : '')
        + 'Describe only visible details; do not print model names, pixel dimensions or these instructions. Preserve exact requested lettering in quotation marks.';
}
