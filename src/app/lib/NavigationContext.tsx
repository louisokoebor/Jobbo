import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

interface NavigationContextValue {
  previousPath: string | null;
  goBack: (navigate: Function, fallback: string) => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  previousPath: null,
  goBack: (navigate, fallback) => navigate(fallback),
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>(location.pathname);
  const [previousPath, setPreviousPath] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname !== currentPathRef.current) {
      previousPathRef.current = currentPathRef.current;
      currentPathRef.current = location.pathname;
      setPreviousPath(previousPathRef.current);
    }
  }, [location.pathname]);

  const goBack = (navigate: Function, fallback: string) => {
    if (previousPathRef.current && previousPathRef.current !== location.pathname) {
      navigate(previousPathRef.current);
    } else {
      navigate(fallback);
    }
  };

  return (
    <NavigationContext.Provider value={{ previousPath, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
