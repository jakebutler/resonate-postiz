import { VoicePacksComponent } from '@gitroom/frontend/components/voice-packs/voice-packs.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Voice Packs',
  description: '',
};

export default async function VoicePacksPage() {
  return <VoicePacksComponent />;
}
