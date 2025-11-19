import type { FeatureDefinitionSet, FeatureSchema, Segment, StorageProvider } from '../../core';

interface InstantDBResponse<TSchema extends FeatureSchema> {
  definitions: FeatureDefinitionSet<TSchema>;
  segments: Segment[];
  version: string | number;
}

interface InstantDBOverridesResponse<TSchema extends FeatureSchema> {
  overrides: Partial<TSchema> | null;
}

export interface InstantDBFeatureStoreOptions<TSchema extends FeatureSchema> {
  baseUrl: string;
  appId: string;
  apiKey?: string;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

async function http(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export class InstantDBFeatureStore<TSchema extends FeatureSchema> implements StorageProvider<TSchema> {
  private readonly baseUrl: string;

  private readonly appId: string;

  private readonly apiKey?: string;

  private readonly fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: InstantDBFeatureStoreOptions<TSchema>) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.appId = options.appId;
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? http;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private url(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}/apps/${this.appId}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    }
    return url.toString();
  }

  async getEnvironmentDefinition(environment: string): Promise<FeatureDefinitionSet<TSchema>> {
    const response = await this.fetcher(this.url('/features', { environment }), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error('Failed to load feature definitions');
    }
    const payload = (await response.json()) as InstantDBResponse<TSchema>;
    return payload.definitions;
  }

  async getSegments(): Promise<Segment[]> {
    const response = await this.fetcher(this.url('/features'), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error('Failed to load segments');
    }
    const payload = (await response.json()) as InstantDBResponse<TSchema>;
    return payload.segments;
  }

  async getVersion(environment: string): Promise<string | number> {
    const response = await this.fetcher(this.url('/features', { environment }), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error('Failed to load feature version');
    }
    const payload = (await response.json()) as InstantDBResponse<TSchema>;
    return payload.version;
  }

  async getUserOverrides(identityKey: string): Promise<Partial<TSchema> | null> {
    const response = await this.fetcher(this.url(`/identities/${identityKey}/overrides`), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error('Failed to load overrides');
    }
    const payload = (await response.json()) as InstantDBOverridesResponse<TSchema>;
    return payload.overrides;
  }

  async setUserOverrides(identityKey: string, overrides: Partial<TSchema>): Promise<void> {
    const response = await this.fetcher(this.url(`/identities/${identityKey}/overrides`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ overrides }),
    });
    if (!response.ok) {
      throw new Error('Failed to persist overrides');
    }
  }
}
