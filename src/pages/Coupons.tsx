import { toast } from '../lib/store';
import type { Coupon } from '../lib/types';
import { btnPrimary, Card, Empty, Glyph, PageHeader } from '../components/ui';

const DEFAULTS: Coupon[] = [
  { code: 'DADA10', title: '10% off VPS hosting', detail: 'Keep your MT4/MT5 running 24/7 with a forex VPS.', discount: '10%', expires: '2026-12-31', claimed: false },
  { code: 'JOURNAL20', title: '20% off prop challenge', detail: 'Partner prop firm discount for journal users.', discount: '20%', expires: '2026-10-31', claimed: false },
  { code: 'SPREAD0', title: 'Zero-spread week', detail: 'One week of zero-spread trading on majors.', discount: '100%', expires: '2026-09-30', claimed: false },
];

export default function Coupons({ coupons, setCoupons }: { coupons: Coupon[]; setCoupons: (c: Coupon[]) => void }) {
  const list = coupons.length ? coupons : DEFAULTS;
  const claim = (code: string) => {
    const next = (coupons.length ? coupons : DEFAULTS).map(c => (c.code === code ? { ...c, claimed: true } : c));
    setCoupons(next);
    navigator.clipboard?.writeText(code).catch(() => {});
    toast.ok(`Code ${code} claimed & copied!`);
  };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Member perks" title="Coupons" sub="Partner offers & perks. Click claim to copy the code." />
      {list.length === 0 ? <Card><Empty icon="🎟️" title="No coupons right now" hint="Check back later for partner offers." /></Card> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map(c => (
            <Card key={c.code} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-600 via-violet-500 to-fuchsia-500" />
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow"><Glyph name="ticket" className="w-6 h-6" /></span>
              <h2 className="font-display font-bold mt-2 text-slate-900 dark:text-white">{c.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{c.detail}</p>
              <div className="flex items-center justify-between mt-3">
                <code className="num font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700">{c.code}</code>
                <span className="text-xs font-bold text-emerald-600">-{c.discount}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Expires {c.expires}</p>
              <button className={btnPrimary + ' w-full mt-3'} disabled={c.claimed} onClick={() => claim(c.code)}>{c.claimed ? '✓ Claimed' : 'Claim & copy code'}</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
