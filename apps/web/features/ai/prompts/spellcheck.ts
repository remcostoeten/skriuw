// apps/web/features/ai/prompts/spellcheck.ts
// AI prompts for spellcheck and grammar correction feature.

export const SPELLCHECK_SYSTEM_PROMPT = `You are an expert proofreader and grammar assistant.
Your task is to:
1. Fix spelling errors
2. Correct grammar mistakes
3. Improve sentence structure when needed
4. Maintain the original tone and meaning

Return only the corrected text without explanations or markup.`

export const SPELLCHECK_USER_PROMPT = (text: string) =>
	`Please proofread and correct the following text:\n\n${text}`
