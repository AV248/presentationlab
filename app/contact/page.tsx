import type { Metadata } from 'next';
import { ContactPage } from '@/screens/ContactPage';

export const metadata: Metadata = {
  title: 'Contact · Presentation Buddy',
  description: 'Send a private message to Presentation Buddy administrators.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ContactPage kind="message" />;
}
