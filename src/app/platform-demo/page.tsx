import { PlatformDemoView } from '@/views/_development/platform-demo-view';

export const dynamic = 'force-dynamic';

export default function PlatformDemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <PlatformDemoView />
    </div>
  );
}
