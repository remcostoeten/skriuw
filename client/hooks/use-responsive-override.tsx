import { useEffect, useState } from 'react';
import { useUserPreferences } from '../shared/data/settings/use-feature-flags';

/**
 * Hook to override responsive behavior for development purposes
 * When disableResponsive is true, it forces desktop layout regardless of screen size
 */
export function useResponsiveOverride() {
  const { settings } = useUserPreferences();
  const disableResponsive = settings.disableResponsive || false;

  // Track actual responsive state vs override state
  const [isActuallyMobile, setIsActuallyMobile] = useState(false);
  const [isOverride, setIsOverride] = useState(false);

  useEffect(() => {
    // Check actual screen size for debugging/info
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768;
      setIsActuallyMobile(mobile);
      setIsOverride(disableResponsive && mobile);
    };

    // Initial check
    checkScreenSize();

    // Listen to resize events
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, [disableResponsive]);

  // When disableResponsive is true, always return desktop state
  const isMobile = disableResponsive ? false : isActuallyMobile;
  const isDesktop = disableResponsive ? true : !isActuallyMobile;

  return {
    isMobile,
    isDesktop,
    isActuallyMobile,
    isOverride,
    disableResponsive,
  };
}