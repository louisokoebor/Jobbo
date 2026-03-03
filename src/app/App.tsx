import { RouterProvider } from 'react-router';
import { router } from './routes';
import { UserPlanProvider } from './lib/UserPlanContext';

export default function App() {
  return (
    <UserPlanProvider>
      <RouterProvider router={router} />
    </UserPlanProvider>
  );
}