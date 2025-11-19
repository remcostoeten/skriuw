import { createServer } from "../../server";

// Initialize server asynchronously
let appInstance: Awaited<ReturnType<typeof createServer>> | null = null;

// Convert Netlify event to Request
function netlifyEventToRequest(event: any): Request {
  const url = `https://${event.headers.host || event.headers.Host || "localhost"}${event.path}`;
  const headers = new Headers();
  
  // Convert Netlify headers to Headers object
  Object.entries(event.headers || {}).forEach(([key, value]) => {
    headers.set(key.toLowerCase(), value as string);
  });

  return new Request(url, {
    method: event.httpMethod || event.requestContext?.http?.method || "GET",
    headers,
    body: event.body ? event.body : undefined,
  });
}

// Convert Response to Netlify format
async function responseToNetlifyFormat(response: Response) {
  const body = await response.text();
  const headers: Record<string, string> = {};
  
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: false,
  };
}

export const handler = async (event: any, context: any) => {
  if (!appInstance) {
    appInstance = await createServer();
  }

  const request = netlifyEventToRequest(event);
  const response = await appInstance.fetch(request);
  return responseToNetlifyFormat(response);
};
