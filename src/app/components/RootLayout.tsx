import { Outlet } from 'react-router';
import { NavigationProvider } from '../lib/NavigationContext';

/* One-time migration: reset theme default from dark → light.
   Runs synchronously before first render so no flash occurs. */
if (typeof window !== 'undefined' && !localStorage.getItem('applyly-theme-v2-migrated')) {
  localStorage.removeItem('applyly-theme');
  localStorage.setItem('applyly-theme-v2-migrated', '1');
}

export function RootLayout() {
  return (
    <NavigationProvider>
      <Outlet />
    </NavigationProvider>
  );
}