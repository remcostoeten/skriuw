
import { streamText } from "ai";
import { injectDocumentStateMessages, toolDefinitionsToToolSet, aiDocumentFormats } from "@blocknote/xl-ai/server";
import { json } from "@remix-run/node"; // adjust import based on your framework (Next.js uses next/server)

// In Next.js 13+ Server Actions you can export a function directly.
// Here we provide a generic handler that works for both API routes and Server Actions.

export async function POST(req: Request) {
    try {
        const { messages, toolDefinitions } = await req.json();

        // The global provider is already attached to globalThis.AI_SDK_DEFAULT_PROVIDER by config.ts.
        // We simply call streamText with the model derived from the provider.
        const result = streamText({
            // The provider will be resolved from the global default.
            // If you need to specify a model explicitly, you can pass it here, e.g.:
            // model: "google/gemini-1.5-flash",
            model: undefined, // rely on global provider default
            system: aiDocumentFormats.html.systemPrompt,
            messages: injectDocumentStateMessages(messages),
            tools: toolDefinitions ? toolDefinitionsToToolSet(toolDefinitions) : undefined,
            // Enable raw chunk access for debugging / logging.
            includeRawChunks: true,
        });

        // Return a streaming response compatible with the AI SDK UI components.
        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("AI chat route error:", error);
        return json({ error: "Failed to process AI request" }, { status: 500 });
    }
}
