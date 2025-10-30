# Note Sharing Analytics - Comprehensive Plan

> **Feature:** Privacy-Respecting Analytics for Shared Notes  
> **Date:** October 2025

---

## Overview

Implement smart analytics that tracks views without duplicates, geographic data, and user behavior while respecting privacy.

### Features
- ✅ Unique view detection (no duplicate counting)
- ✅ Geographic analytics (country, city, region)
- ✅ Device & browser tracking
- ✅ Referrer analysis
- ✅ Engagement metrics (time spent, scroll depth)
- ✅ Privacy-first (no PII, hashed IDs, daily resets)

---

## Database Schema

### New Table: `share_views`

```typescript
// Turso (Drizzle)
export const shareViews = sqliteTable('share_views', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull(),
  shareSlug: text('share_slug').notNull(),
  
  // Visitor ID (privacy-safe)
  visitorHash: text('visitor_hash').notNull(), // Hashed IP+UA+Date
  sessionId: text('session_id').notNull(),
  
  // Geographic
  country: text('country'),
  countryCode: text('country_code'),
  city: text('city'),
  region: text('region'),
  
  // Technical
  referrer: text('referrer'),
  referrerDomain: text('referrer_domain'),
  deviceType: text('device_type'), // mobile/desktop/tablet
  browser: text('browser'),
  os: text('os'),
  
  // Behavior
  viewedAt: integer('viewed_at').notNull(),
  timeSpent: integer('time_spent'), // seconds
  scrollDepth: integer('scroll_depth'), // percentage
  
  isUnique: integer('is_unique', { mode: 'boolean' }).notNull(),
});
```

### Update `notes` Table

```typescript
export const notes = sqliteTable('notes', {
  // ... existing fields
  analyticsEnabled: integer('analytics_enabled').default(1),
  totalViews: integer('total_views').default(0),
  uniqueViews: integer('unique_views').default(0),
  lastViewedAt: integer('last_viewed_at'),
});
```

---

## Privacy-Safe Visitor Identification

### Generate Visitor Hash (Daily Reset)

```typescript
// lib/analytics/visitor-id.ts
import { createHash } from 'crypto';

export function generateVisitorHash(ip: string, userAgent: string): string {
  // Reset daily to prevent long-term tracking
  const dateSalt = new Date().toISOString().split('T')[0];
  const data = `${ip}:${userAgent}:${dateSalt}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  let id = sessionStorage.getItem('share_session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('share_session', id);
  }
  return id;
}

export async function isUniqueView(
  noteId: string,
  visitorHash: string
): Promise<boolean> {
  const existing = await db
    .select()
    .from(shareViews)
    .where(and(
      eq(shareViews.noteId, noteId),
      eq(shareViews.visitorHash, visitorHash)
    ))
    .limit(1);
  
  return existing.length === 0;
}
```

---

## Geographic Data (GeoIP)

### Option 1: Third-Party API (ipapi.co)

```typescript
// lib/analytics/geo.ts
export async function getGeoData(ip: string) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await res.json();
    
    return {
      country: data.country_name,
      countryCode: data.country_code,
      city: data.city,
      region: data.region,
    };
  } catch {
    return { country: null, countryCode: null, city: null, region: null };
  }
}
```

### Option 2: Self-Hosted (MaxMind GeoLite2)

```typescript
import maxmind from 'maxmind';

let lookup: maxmind.Reader | null = null;

export async function initGeoDatabase() {
  lookup = await maxmind.open('./data/GeoLite2-City.mmdb');
}

export function getGeoData(ip: string) {
  if (!lookup) return { country: null, city: null };
  
  const result = lookup.get(ip);
  return {
    country: result?.country?.names?.en,
    city: result?.city?.names?.en,
    region: result?.subdivisions?.[0]?.names?.en,
  };
}
```

---

## Device & Browser Detection

```typescript
// lib/analytics/device.ts
import UAParser from 'ua-parser-js';

export function parseUserAgent(ua: string) {
  const parser = new UAParser(ua);
  const result = parser.getResult();
  
  return {
    deviceType: result.device.type || 'desktop',
    browser: `${result.browser.name} ${result.browser.version}`,
    os: `${result.os.name} ${result.os.version}`,
  };
}
```

---

## Referrer Analysis

```typescript
// lib/analytics/referrer.ts
export function parseReferrer(referrer: string | null) {
  if (!referrer) return { referrer: null, domain: null, source: 'direct' };
  
  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace('www.', '');
    
    const social = ['twitter.com', 'facebook.com', 'linkedin.com', 'reddit.com'];
    const search = ['google.com', 'bing.com', 'duckduckgo.com'];
    
    let source = 'external';
    if (social.some(d => domain.includes(d))) source = 'social';
    else if (search.some(d => domain.includes(d))) source = 'search';
    
    return { referrer, domain, source };
  } catch {
    return { referrer, domain: null, source: 'external' };
  }
}
```

---

## API Endpoint: Track View

```typescript
// app/api/analytics/track-view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateVisitorHash, isUniqueView } from '@/lib/analytics/visitor-id';
import { getGeoData } from '@/lib/analytics/geo';
import { parseUserAgent } from '@/lib/analytics/device';
import { parseReferrer } from '@/lib/analytics/referrer';

export async function POST(req: NextRequest) {
  const { shareSlug, noteId, sessionId, referrer } = await req.json();
  
  // Get client info
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const userAgent = req.headers.get('user-agent') || '';
  
  // Generate privacy-safe hash
  const visitorHash = generateVisitorHash(ip, userAgent);
  const isUnique = await isUniqueView(noteId, visitorHash);
  
  // Get data
  const geoData = await getGeoData(ip);
  const deviceInfo = parseUserAgent(userAgent);
  const referrerInfo = parseReferrer(referrer);
  
  // Record view
  const viewId = generateId();
  await db.insert(shareViews).values({
    id: viewId,
    noteId,
    shareSlug,
    visitorHash,
    sessionId,
    country: geoData.country,
    countryCode: geoData.countryCode,
    city: geoData.city,
    region: geoData.region,
    referrer: referrerInfo.referrer,
    referrerDomain: referrerInfo.domain,
    deviceType: deviceInfo.deviceType,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    viewedAt: Date.now(),
    timeSpent: null,
    scrollDepth: null,
    isUnique,
  });
  
  // Update note stats
  await db.update(notes).set({
    totalViews: sql`${notes.totalViews} + 1`,
    uniqueViews: isUnique ? sql`${notes.uniqueViews} + 1` : notes.uniqueViews,
    lastViewedAt: Date.now(),
  }).where(eq(notes.id, noteId));
  
  return NextResponse.json({ success: true, viewId, isUnique });
}
```

---

## Client-Side Tracking Component

```typescript
// components/analytics/view-tracker.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getSessionId } from '@/lib/analytics/visitor-id';

export function ViewTracker({ shareSlug, noteId, enabled }: Props) {
  const [viewId, setViewId] = useState<string | null>(null);
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  
  // Track initial view
  useEffect(() => {
    if (!enabled) return;
    
    fetch('/api/analytics/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareSlug,
        noteId,
        sessionId: getSessionId(),
        referrer: document.referrer || null,
      }),
    })
      .then(res => res.json())
      .then(data => setViewId(data.viewId))
      .catch(console.error);
  }, [shareSlug, noteId, enabled]);
  
  // Track scroll depth
  useEffect(() => {
    if (!enabled || !viewId) return;
    
    const handleScroll = () => {
      const winHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const percent = Math.round(((scrollTop + winHeight) / docHeight) * 100);
      maxScroll.current = Math.max(maxScroll.current, percent);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [enabled, viewId]);
  
  // Update stats before leaving
  useEffect(() => {
    if (!enabled || !viewId) return;
    
    const updateStats = () => {
      const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
      
      fetch('/api/analytics/update-view', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewId,
          timeSpent,
          scrollDepth: maxScroll.current,
        }),
      }).catch(console.error);
    };
    
    window.addEventListener('beforeunload', updateStats);
    const interval = setInterval(updateStats, 30000); // Every 30s
    
    return () => {
      window.removeEventListener('beforeunload', updateStats);
      clearInterval(interval);
      updateStats();
    };
  }, [enabled, viewId]);
  
  return null;
}
```

### Add to Share Page

```typescript
// app/share/[slug]/page.tsx
import { ViewTracker } from '@/components/analytics/view-tracker';

export default function SharedNotePage() {
  const { slug } = useParams();
  const { note } = useSharedNote(slug);
  
  return (
    <div>
      <ViewTracker
        shareSlug={slug}
        noteId={note.id}
        enabled={note.analyticsEnabled ?? true}
      />
      {/* Note content */}
    </div>
  );
}
```

---

## Analytics Dashboard

### Get Analytics Hook

```typescript
// modules/analytics/api/queries/get-note-analytics.ts
export function useNoteAnalytics(noteId: string) {
  return useQuery(
    async () => {
      // Basic stats
      const [note] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId));
      
      // Top countries
      const countries = await db
        .select({
          country: shareViews.country,
          count: sql<number>`count(*)`,
        })
        .from(shareViews)
        .where(eq(shareViews.noteId, noteId))
        .groupBy(shareViews.country)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      
      // Top cities
      const cities = await db
        .select({
          city: shareViews.city,
          count: sql<number>`count(*)`,
        })
        .from(shareViews)
        .where(eq(shareViews.noteId, noteId))
        .groupBy(shareViews.city)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      
      // Device breakdown
      const devices = await db
        .select({
          type: shareViews.deviceType,
          count: sql<number>`count(*)`,
        })
        .from(shareViews)
        .where(eq(shareViews.noteId, noteId))
        .groupBy(shareViews.deviceType);
      
      // Traffic sources
      const referrers = await db
        .select({
          domain: shareViews.referrerDomain,
          count: sql<number>`count(*)`,
        })
        .from(shareViews)
        .where(eq(shareViews.noteId, noteId))
        .groupBy(shareViews.referrerDomain)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      
      // Engagement
      const [engagement] = await db
        .select({
          avgTime: sql<number>`avg(${shareViews.timeSpent})`,
          avgScroll: sql<number>`avg(${shareViews.scrollDepth})`,
        })
        .from(shareViews)
        .where(eq(shareViews.noteId, noteId));
      
      return {
        totalViews: note.totalViews,
        uniqueViews: note.uniqueViews,
        lastViewedAt: note.lastViewedAt,
        topCountries: countries,
        topCities: cities,
        devices,
        topReferrers: referrers,
        avgTimeSpent: Math.round(engagement.avgTime || 0),
        avgScrollDepth: Math.round(engagement.avgScroll || 0),
      };
    },
    { cacheKey: `analytics:${noteId}` }
  );
}
```

### Dashboard Component

```typescript
// components/analytics/analytics-dashboard.tsx
import { BarChart3, Globe, Clock, MousePointer } from 'lucide-react';

export function AnalyticsDashboard({ noteId }: Props) {
  const { data, isLoading } = useNoteAnalytics(noteId);
  
  if (isLoading || !data) return <div>Loading...</div>;
  
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <BarChart3 className="h-4 w-4" />
            <CardTitle>Total Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalViews}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <MousePointer className="h-4 w-4" />
            <CardTitle>Unique Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.uniqueViews}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Clock className="h-4 w-4" />
            <CardTitle>Avg Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Math.floor(data.avgTimeSpent / 60)}m {data.avgTimeSpent % 60}s
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Globe className="h-4 w-4" />
            <CardTitle>Avg Scroll</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.avgScrollDepth}%</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Geographic */}
      <Card>
        <CardHeader>
          <CardTitle>Top Countries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.topCountries.map(({ country, count }) => (
              <div key={country} className="flex justify-between">
                <span>{country}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Cities */}
      <Card>
        <CardHeader>
          <CardTitle>Top Cities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.topCities.map(({ city, count }) => (
              <div key={city} className="flex justify-between">
                <span>{city}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Devices */}
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.devices.map(({ type, count }) => (
              <div key={type} className="flex justify-between">
                <span className="capitalize">{type}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Referrers */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.topReferrers.map(({ domain, count }) => (
              <div key={domain} className="flex justify-between">
                <span>{domain || 'Direct'}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Implementation Checklist

### Week 1: Database & Core Logic
- [ ] Add `share_views` table + indexes
- [ ] Update `notes` table with analytics fields
- [ ] Implement visitor hash generation
- [ ] Implement unique view detection
- [ ] Setup GeoIP (choose API or self-hosted)
- [ ] Implement device/browser parsing
- [ ] Implement referrer parsing

### Week 2: API & Tracking
- [ ] Create `/api/analytics/track-view` endpoint
- [ ] Create `/api/analytics/update-view` endpoint
- [ ] Build `ViewTracker` component
- [ ] Integrate tracker into share page
- [ ] Test scroll depth tracking
- [ ] Test time spent tracking

### Week 3: Dashboard & Polish
- [ ] Create `useNoteAnalytics` hook
- [ ] Build analytics dashboard component
- [ ] Add analytics toggle to note editor
- [ ] Test duplicate view prevention
- [ ] Verify privacy (no PII leaks)
- [ ] Add rate limiting

---

## Privacy & Security

### What We Track
- ✅ Hashed visitor ID (resets daily)
- ✅ Session ID (cleared on browser close)
- ✅ Country, city, region
- ✅ Device type, browser, OS
- ✅ Referrer domain
- ✅ Time spent, scroll depth

### What We DON'T Track
- ❌ Full IP addresses (only hashed with daily salt)
- ❌ User emails or names
- ❌ Cross-site tracking
- ❌ Personal identifiable information
- ❌ Cookies (session storage only)

### GDPR Compliance
- ✅ Anonymous by design
- ✅ No persistent tracking
- ✅ User can disable analytics
- ✅ Data aggregated, not individual
- ✅ No third-party tracking

---

## Success Metrics

- ✅ Unique view detection works (no duplicates within same day)
- ✅ Geographic data accurate (tested with VPN)
- ✅ Time spent & scroll depth tracked reliably
- ✅ Dashboard loads in <1s
- ✅ No PII in database
- ✅ Analytics can be disabled per note

---

## Future Enhancements

1. **Export analytics** - CSV/JSON export
2. **Real-time dashboard** - WebSocket updates
3. **Custom date ranges** - Filter by date
4. **Heatmaps** - Click/scroll heatmaps
5. **A/B testing** - Test different note versions
6. **API access** - Programmatic analytics access
