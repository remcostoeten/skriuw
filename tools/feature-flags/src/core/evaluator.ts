import { bucketValue } from './hash';
import type {
  Condition,
  Context,
  EvaluatedState,
  Explain,
  FeatureDefinitionSet,
  FeatureSchema,
  FeatureValue,
  IdentityResult,
  Rule,
  Segment,
} from './types';

const PRIORITY_FALLBACK = 0;

function getAttributeValue(ctx: Context, attribute: string): FeatureValue | undefined {
  if (attribute.startsWith('traits.')) {
    const key = attribute.replace('traits.', '');
    return ctx.traits?.[key];
  }
  return (ctx as Record<string, FeatureValue | undefined>)[attribute];
}

function passesCondition(ctx: Context, condition: Condition): boolean {
  const left = getAttributeValue(ctx, condition.attribute);
  switch (condition.operator) {
    case 'eq':
      return left === condition.value;
    case 'neq':
      return left !== condition.value;
    case 'gt':
      return typeof left === 'number' && typeof condition.value === 'number' && left > condition.value;
    case 'gte':
      return typeof left === 'number' && typeof condition.value === 'number' && left >= condition.value;
    case 'lt':
      return typeof left === 'number' && typeof condition.value === 'number' && left < condition.value;
    case 'lte':
      return typeof left === 'number' && typeof condition.value === 'number' && left <= condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(left as FeatureValue);
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(left as FeatureValue);
    case 'contains':
      if (typeof left === 'string' && typeof condition.value === 'string') {
        return left.includes(condition.value);
      }
      if (Array.isArray(left)) {
        return left.includes(condition.value as FeatureValue);
      }
      return false;
    case 'exists':
      return left !== undefined && left !== null;
    case 'not_exists':
      return left === undefined || left === null;
    default:
      return false;
  }
}

function segmentMatches(ctx: Context, segment: Segment | undefined): boolean {
  if (!segment) {
    return false;
  }
  return segment.conditions.every((condition) => passesCondition(ctx, condition));
}

function ruleMatches<TSchema extends FeatureSchema>(
  ctx: Context,
  rule: Rule<TSchema[keyof TSchema]>,
  segments: Segment[],
  identity: IdentityResult,
): { matched: boolean; bucket?: number } {
  if (rule.segmentId) {
    const segment = segments.find((seg) => seg.id === rule.segmentId);
    if (!segmentMatches(ctx, segment)) {
      return { matched: false };
    }
  }
  if (rule.conditions && rule.conditions.some((cond) => !passesCondition(ctx, cond))) {
    return { matched: false };
  }
  if (typeof rule.percentage === 'number') {
    const { bucket, enabled } = bucketValue(identity.identityKey, rule.id, rule.percentage);
    if (!enabled) {
      return { matched: false, bucket };
    }
    return { matched: true, bucket };
  }
  return { matched: true };
}

export function evaluateDefinitionSet<TSchema extends FeatureSchema>(
  defs: FeatureDefinitionSet<TSchema>,
  ctx: Context,
  identity: IdentityResult,
  segments: Segment[],
  options?: {
    userOverrides?: Partial<TSchema> | null;
    localOverrides?: Partial<TSchema> | null;
  },
): EvaluatedState<TSchema> {
  const environmentName = ctx.environment;
  const env = defs.environments[environmentName];
  const explain = {} as Explain<TSchema>;
  const state = {} as TSchema;

  (Object.keys(defs.features) as (keyof TSchema)[]).forEach((key) => {
    const featureDef = defs.features[key];
    let value = featureDef.defaultValue;
    const layers = [{ layer: 'default' as const, source: featureDef.key, reason: 'global default' }];
    let bucket: number | undefined;

    if (env?.defaults && key in env.defaults && env.defaults[key] !== undefined) {
      value = env.defaults[key] as TSchema[typeof key];
      layers.push({ layer: 'environment', source: environmentName, reason: 'environment default' });
    }

    const rules = env?.rules?.[key] ?? [];
    const orderedRules = [...rules].sort((a, b) => (b.priority ?? PRIORITY_FALLBACK) - (a.priority ?? PRIORITY_FALLBACK));
    for (const rule of orderedRules) {
      const { matched, bucket: computedBucket } = ruleMatches(ctx, rule, segments, identity);
      if (!matched) {
        continue;
      }
      bucket = computedBucket ?? bucket;
      value = rule.value as TSchema[typeof key];
      layers.push({ layer: 'rule', ruleId: rule.id, segmentId: rule.segmentId, reason: 'rule matched' });
      break;
    }

    if (options?.userOverrides && options.userOverrides[key] !== undefined) {
      value = options.userOverrides[key] as TSchema[typeof key];
      layers.push({ layer: 'user-override', reason: 'user override' });
    }

    if (options?.localOverrides && options.localOverrides[key] !== undefined) {
      value = options.localOverrides[key] as TSchema[typeof key];
      layers.push({ layer: 'local-override', reason: 'local override' });
    }

    state[key] = value;
    explain[key] = {
      key: featureDef.key,
      value,
      layers,
      bucket,
    } as Explain<TSchema>[typeof key];
  });

  return {
    state,
    explain,
    identity,
    version: env?.name ?? environmentName,
  };
}
