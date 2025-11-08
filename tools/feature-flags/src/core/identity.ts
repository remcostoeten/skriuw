import { stableHash } from './hash';
import type { Context, IdentityResolver, IdentityResult } from './types';

export interface DefaultIdentityResolverOptions {
  salt: string;
}

const DEFAULT_SALT = 'skriuw:feature-flags';

export function defaultIdentityResolver(options: DefaultIdentityResolverOptions = { salt: DEFAULT_SALT }): IdentityResolver {
  const { salt } = options;
  return (ctx: Context): IdentityResult => {
    if (ctx.userId) {
      return { identityKey: ctx.userId, method: 'userId' };
    }
    if (ctx.fingerprint) {
      return { identityKey: ctx.fingerprint, method: 'fingerprint' };
    }
    if (ctx.ip) {
      return { identityKey: ctx.ip, method: 'ip' };
    }
    const traitsString = ctx.traits ? JSON.stringify(ctx.traits) : '';
    const source = `${ctx.environment}:${traitsString}:${ctx.requestMeta?.userAgent ?? ''}`;
    const identityKey = `anon_${stableHash(`${salt}:${source}`).toString(16)}`;
    return { identityKey, method: 'anonymous' };
  };
}
