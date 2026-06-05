import { IdeasComponent } from '@gitroom/frontend/components/ideas/ideas.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ideas',
  description: '',
};

export default async function IdeasPage() {
  return <IdeasComponent />;
}
