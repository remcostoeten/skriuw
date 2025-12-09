# Open Graph Image Generation Integration Plan

This document outlines the plan to integrate Vercel's Open Graph image generation into the skriuwde project.

## Overview

Vercel's OG Image Generation allows dynamic creation of social media images using HTML/CSS templates. This will enable automatic generation of beautiful share images for notes, folders, and other content types in the application.

## Current State Analysis

Based on the project structure, this appears to be a Next.js application with:
- Notes management system
- AI integration
- Settings management
- Multi-tab preview functionality

## Implementation Plan

### Phase 1: Setup and Dependencies

1. **Install Required Dependencies**
   ```bash
   bun add @vercel/og satori
   ```

2. **Create OG Image Route Structure**
   - Create `/app/api/og/route.ts` for main OG image generation
   - Create specific routes for different content types (notes, folders, etc.)

### Phase 2: Core OG Image Templates

1. **Create OG Image Components**
   - Design reusable OG image templates
   - Implement responsive layouts for different aspect ratios
   - Add support for dark/light mode variants

2. **Content-Specific Templates**
   - **Note OG Images**: Title, excerpt, author, creation date
   - **Folder OG Images**: Folder name, note count, description
   - **Profile OG Images**: User information, statistics
   - **Default OG Images**: App branding and generic content

### Phase 3: Dynamic Data Integration

1. **Database Integration**
   - Fetch note/folder metadata for OG generation
   - Cache frequently accessed OG images
   - Implement fallback data for missing content

2. **URL Structure**
   ```
   /api/og/note/[id]          - Individual note images
   /api/og/folder/[id]        - Folder collection images
   /api/og/profile/[userId]   - User profile images
   /api/og/default            - Default app image
   ```

### Phase 4: Performance Optimizations

1. **Caching Strategy**
   - Implement Edge caching for generated images
   - Cache responses with appropriate headers
   - Use ISR (Incremental Static Regeneration) where applicable

2. **Image Optimization**
   - Optimize font loading (Google Fonts or local fonts)
   - Minimize external dependencies in OG generation
   - Implement error boundaries for fallback images

### Phase 5: Meta Tags Integration

1. **Update Document Head**
   - Add dynamic OG meta tags to note and folder pages
   - Implement Twitter Card compatibility
   - Add structured data (JSON-LD) for enhanced sharing

2. **Social Media Testing**
   - Test with Facebook Debugger
   - Test with Twitter Card Validator
   - Verify LinkedIn and other platforms

## Technical Implementation Details

### File Structure
```
app/
├── api/
│   └── og/
│       ├── route.ts              # Main OG endpoint
│       ├── note/
│       │   └── [id]/
│       │       └── route.ts      # Note-specific OG
│       ├── folder/
│       │   └── [id]/
│       │       └── route.ts      # Folder-specific OG
│       └── profile/
│           └── [userId]/
│               └── route.ts      # Profile OG
├── lib/
│   └── og/
│       ├── templates.tsx         # OG template components
│       ├── utils.ts              # OG generation utilities
│       └── fonts.ts              # Font loading logic
```

### Sample Implementation Structure

```typescript
// app/api/og/note/[id]/route.ts
import { ImageResponse } from 'next/og';
import { NoteTemplate } from '@/lib/og/templates';

export const runtime = 'edge';

export async function GET(request: Request, { params }) {
  const { id } = params;
  const note = await getNoteMetadata(id);

  return new ImageResponse(
    <NoteTemplate note={note} />,
    {
      width: 1200,
      height: 630,
    }
  );
}
```

## Integration Points

### 1. Note Pages
- Update `/apps/web/features/notes` components to include OG meta tags
- Generate OG images for all public/shared notes

### 2. Folder Pages
- Create folder-specific OG images showing collection overview
- Include note count and folder metadata

### 3. User Profiles
- Generate profile OG images with user statistics
- Include avatar and username

### 4. Settings Integration
- Add OG image customization options in settings
- Allow users to choose templates or customize branding

## Success Metrics

1. **Functional Requirements**
   - All note/folder pages generate valid OG images
   - Images load within 2 seconds
   - 100% success rate for image generation

2. **Performance Requirements**
   - Edge caching命中率 > 90%
   - Image size under 200KB
   - First paint time under 500ms

3. **Quality Requirements**
   - Consistent branding across all OG images
   - Responsive design for various social platforms
   - Accessibility compliance (alt text, readable fonts)

## Rollout Plan

### Week 1: Foundation
- Install dependencies
- Create basic OG route structure
- Implement default template

### Week 2: Content Templates
- Build note-specific OG templates
- Implement folder templates
- Add database integration

### Week 3: Optimization
- Implement caching strategies
- Add performance optimizations
- Create meta tag integration

### Week 4: Testing & Polish
- Test across social media platforms
- Add error handling and fallbacks
- Settings integration and customization

## Risks and Mitigations

### Risk 1: Performance Impact
- **Mitigation**: Edge caching, optimized templates, minimal external dependencies

### Risk 2: Design Consistency
- **Mitigation**: Use existing design tokens, create template system

### Risk 3: Complex Data Requirements
- **Mitigation**: Implement fallback data, graceful degradation

## Next Steps

1. Review and approve this plan
2. Set up development environment for OG generation
3. Begin Phase 1 implementation
4. Regular progress reviews and adjustments

---

*This plan should be reviewed and updated as implementation progresses and requirements evolve.*