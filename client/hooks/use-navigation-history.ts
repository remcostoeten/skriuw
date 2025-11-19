import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function useNavigationHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const historyRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Initialize history with current location
  useEffect(() => {
    const currentPath = location.pathname;
    const history = historyRef.current;
    const currentIndex = currentIndexRef.current;

    // If we're navigating to a new note (not going back/forward)
    if (history[currentIndex] !== currentPath) {
      // Remove any forward history if we're not at the end
      if (currentIndex < history.length - 1) {
        historyRef.current = history.slice(0, currentIndex + 1);
      }
      // Add new location
      historyRef.current.push(currentPath);
      currentIndexRef.current = historyRef.current.length - 1;
    }

    // Update button states
    setCanGoBack(currentIndexRef.current > 0);
    setCanGoForward(currentIndexRef.current < historyRef.current.length - 1);
  }, [location.pathname]);

  const goBack = () => {
    if (currentIndexRef.current > 0) {
      currentIndexRef.current -= 1;
      const previousPath = historyRef.current[currentIndexRef.current];
      navigate(previousPath);
    }
  };

  const goForward = () => {
    if (currentIndexRef.current < historyRef.current.length - 1) {
      currentIndexRef.current += 1;
      const nextPath = historyRef.current[currentIndexRef.current];
      navigate(nextPath);
    }
  };

  return {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  };
}



