import type { FeatureEngine, FeatureSchema, Context, EvaluatedState } from '../core';

export interface ServerEvaluateOptions {
  ipHeader?: string;
  environment?: string;
  traits?: Context['traits'];
}

export interface MinimalRequestLike {
  headers: Headers | Record<string, string>;
  method?: string;
  url?: string;
  ip?: string | null;
}

function headerValue(headers: Headers | Record<string, string>, key: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return entry ? entry[1] : undefined;
}

export function createContextFromRequest(request: MinimalRequestLike, options: ServerEvaluateOptions = {}): Context {
  const ipHeader = options.ipHeader ?? 'x-forwarded-for';
  const environment = options.environment ?? 'production';
  const ip = request.ip ?? headerValue(request.headers, ipHeader) ?? undefined;
  const userAgent = headerValue(request.headers, 'user-agent');
  return {
    isAuthenticated: false,
    environment,
    ip: ip ?? undefined,
    requestMeta: {
      userAgent,
      headers: request.headers instanceof Headers ? Object.fromEntries(request.headers.entries()) : request.headers,
    },
    traits: options.traits,
  };
}

export async function evaluateOnServer<TSchema extends FeatureSchema>(
  engine: FeatureEngine<TSchema>,
  request: MinimalRequestLike,
  options: ServerEvaluateOptions = {},
): Promise<EvaluatedState<TSchema>> {
  const context = createContextFromRequest(request, options);
  return engine.evaluate(context);
}

export function createHydrationScript<TSchema extends FeatureSchema>(payload: EvaluatedState<TSchema>): string {
  const json = JSON.stringify(payload);
  return `<script id="__feature_flags__" type="application/json">${json.replace(/</g, '\u003c')}</script>`;
}
