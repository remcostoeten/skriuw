'use client';

import {
  Announcement,
  AnnouncementTag,
  AnnouncementTitle,
} from '@/components/ui/announcement';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'docs-announcement-dismissed';

export const AnnouncementBanner = () => {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dismissed = typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY) === 'true'
      : false;

    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (containerRef.current && target && containerRef.current.contains(target)) {
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, 'true');
      setVisible(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed left-1/2 top-6 z-50 -translate-x-1/2"
    >
      <Announcement themed>
        <AnnouncementTag>Note</AnnouncementTag>
        <AnnouncementTitle>
          Docs are incomplete — this section is still a work in progress.
        </AnnouncementTitle>
      </Announcement>
    </div>
  );
};
