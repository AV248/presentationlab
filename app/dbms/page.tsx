import { DbmsPage } from '@/screens/DbmsPage';

export const metadata = {
  title: { absolute: 'Database health · Presentation Buddy' },
  robots: { index: false, follow: false },
  alternates: { canonical: '/dbms' },
};

export default function Page() {
  return <DbmsPage />;
}
