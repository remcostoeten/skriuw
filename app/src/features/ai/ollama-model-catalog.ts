export type OllamaModelUseCase = "general" | "coding" | "reasoning" | "vision";

export type OllamaCatalogModel = {
  id: string;
  label: string;
  description: string;
  approxSize: string;
  useCase: OllamaModelUseCase;
};

const USE_CASE_LABELS: Record<OllamaModelUseCase, string> = {
  general: "General",
  coding: "Coding",
  reasoning: "Reasoning",
  vision: "Vision",
};

export function ollamaUseCaseLabel(useCase: OllamaModelUseCase): string {
  return USE_CASE_LABELS[useCase];
}

/**
 * Curated picks from the Ollama library, not the full catalog. Sizes are
 * approximate download sizes for the default quantization at that tag.
 */
export const OLLAMA_MODEL_CATALOG = [
  {
    id: "llama3.2:1b",
    label: "Llama 3.2 1B",
    description: "Meta's smallest model. Fast on modest hardware, best for quick, simple tasks.",
    approxSize: "~1.3 GB",
    useCase: "general",
  },
  {
    id: "llama3.2:3b",
    label: "Llama 3.2 3B",
    description: "Balanced size and quality from Meta. A solid default for everyday writing help.",
    approxSize: "~2.0 GB",
    useCase: "general",
  },
  {
    id: "llama3.1:8b",
    label: "Llama 3.1 8B",
    description: "Meta's general-purpose workhorse. Stronger reasoning, needs more RAM.",
    approxSize: "~4.7 GB",
    useCase: "general",
  },
  {
    id: "gemma3:4b",
    label: "Gemma 3 4B",
    description: "Google's multilingual model with image understanding built in.",
    approxSize: "~3.3 GB",
    useCase: "vision",
  },
  {
    id: "gemma3:12b",
    label: "Gemma 3 12B",
    description: "Larger Gemma 3 for noticeably better reasoning and writing quality.",
    approxSize: "~8.1 GB",
    useCase: "reasoning",
  },
  {
    id: "qwen2.5:7b",
    label: "Qwen 2.5 7B",
    description: "Alibaba's all-rounder with strong multilingual and coding ability.",
    approxSize: "~4.7 GB",
    useCase: "general",
  },
  {
    id: "qwen2.5-coder:7b",
    label: "Qwen 2.5 Coder 7B",
    description: "Tuned specifically for code generation, review, and explanation.",
    approxSize: "~4.7 GB",
    useCase: "coding",
  },
  {
    id: "mistral:7b",
    label: "Mistral 7B",
    description: "Fast, well-rounded model with a permissive license.",
    approxSize: "~4.1 GB",
    useCase: "general",
  },
  {
    id: "phi4:14b",
    label: "Phi-4 14B",
    description: "Microsoft's compact model that punches above its weight on reasoning.",
    approxSize: "~9.1 GB",
    useCase: "reasoning",
  },
  {
    id: "deepseek-r1:7b",
    label: "DeepSeek R1 7B",
    description: "Shows its chain of thought before answering. Good for step-by-step problems.",
    approxSize: "~4.7 GB",
    useCase: "reasoning",
  },
  {
    id: "llava:7b",
    label: "LLaVA 7B",
    description: "Understands images alongside text — describe, compare, or ask about a picture.",
    approxSize: "~4.7 GB",
    useCase: "vision",
  },
] as const satisfies readonly OllamaCatalogModel[];

export type OllamaSuggestedModelId = (typeof OLLAMA_MODEL_CATALOG)[number]["id"];
