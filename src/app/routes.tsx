import { createBrowserRouter, Navigate } from 'react-router';
import { LoginScreen } from './components/LoginScreen';
import { SignUpScreen } from './components/SignUpScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Dashboard } from './components/Dashboard';
import { NewApplicationScreen } from './components/NewApplicationScreen';
import { CvPreviewPage } from './components/CvPreviewPage';
import { CoverLetterScreen } from './components/CoverLetterScreen';
import { CvEditorScreen } from './components/CvEditorScreen';
import { ApplicationsPage } from './components/ApplicationsPage';
import { ApplicationDetailPage } from './components/ApplicationDetailPage';
import { ProfilePage } from './components/ProfilePage';
import { BillingPage } from './components/BillingPage';
import { AuthCallback } from './components/AuthCallback';

export const router = createBrowserRouter([
  { path: '/',                 Component: LoginScreen },
  { path: '/login',            Component: LoginScreen },
  { path: '/signup',           Component: SignUpScreen },
  { path: '/auth/callback',    Component: AuthCallback },
  { path: '/onboarding',       Component: OnboardingWizard },
  { path: '/dashboard',        Component: Dashboard },
  { path: '/applications',     Component: ApplicationsPage },
  { path: '/applications/:id', Component: ApplicationDetailPage },
  { path: '/profile',          Component: ProfilePage },
  { path: '/billing',          Component: BillingPage },
  { path: '/new-application',  Component: NewApplicationScreen },
  { path: '/cv-preview',       Component: CvPreviewPage },
  { path: '/cover-letter',                            Component: CoverLetterScreen },
  { path: '/cover-letter/:applicationId/:generatedCvId', Component: CoverLetterScreen },
  { path: '/cv-editor',        Component: CvEditorScreen },
  { path: '/cv-editor/:id',    Component: CvEditorScreen },
  { path: '*',                 element: <Navigate to="/login" replace /> },
]);