import { PageHeader } from '../components/ui';

export default function Brokers({ onGo }: { onGo: (p: string) => void }) {
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="" title="" sub="" right={null} />
      <div className="text-center py-12 text-slate-400">
        <p>Broker connections hidden.</p>
      </div>
    </div>
  );
}