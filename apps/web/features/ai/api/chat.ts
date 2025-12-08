import { streamText, convertToModelMessages } from "ai";
import { injectDocumentStateMessages, toolDefinitionsToToolSet, aiDocumentFormats } from "@blocknote/xl-ai/server";

// In Next.js 13+ Server Actions you can export a function directly.
// Here we provide a generic handler that works for both API routes and Server Actions.

export async function POST(req: Request) {
    try {
        const { messages, toolDefinitions } = await req.json();

        // Convert UIMessages to ModelMessages for the AI SDK
        const documentMessages = injectDocumentStateMessages(messages);
        const modelMessages = convertToModelMessages(documentMessages);

        // The global provider is already attached to globalThis.AI_SDK_DEFAULT_PROVIDER by config.ts.
        // We simply call streamText and it will use the global provider automatically.
        const result = streamText({
            model: "google/gemini-1.5-flash",

            system: aiDocumentFormats.html.systemPrompt,
            messages: modelMessages,
            tools: toolDefinitions ? toolDefinitionsToToolSet(toolDefinitions) : undefined,
            // Enable raw chunk access for debugging / logging.
            includeRawChunks: true,
        });

        // Return a streaming response compatible with the AI SDK UI components.
        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("AI chat route error:", error);
        return Response.json({ error: "Failed to process AI request" }, { status: 500 });
    }
}
