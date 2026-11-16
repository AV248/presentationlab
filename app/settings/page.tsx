import { SettingsPage } from '@/screens/SettingsPage';

export const metadata = {
  title: { absolute: 'Profile settings · Presentation Buddy' },
  robots: { index: false, follow: false },
  alternates: { canonical: '/settings' },
};

export default function Page() {
  return <SettingsPage />;
}
