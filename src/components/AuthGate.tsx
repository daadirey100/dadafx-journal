import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { btnPrimary, inputCls } from './ui';

export default function AuthGate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErr('');
    if (!email.includes('@') || pw.length < 6) {
      setErr('Enter a valid email and a 6+ character password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        if (!data.session) {
          setErr('Account created — check your inbox to confirm, then Sign in.');
          setMode('in');
          return;
        }
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <div className="glass rounded-3xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-display font-extrabold text-xl shadow">D</span>
          <div>
            <p className="font-display font-extrabold text-lg leading-none">DadaFX Cloud Sync</p>
            <p className="text-xs text-slate-500 mt-1">Same journal on your PC + laptop</p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-200/60 dark:bg-white/10 rounded-xl p-1 mt-5">
          {(['in', 'up'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(''); }} className={`flex-1 h-9 rounded-lg text-sm font-extrabold transition ${mode === m ? 'bg-white dark:bg-slate-900 shadow text-indigo-600 dark:text-indigo-300' : 'text-slate-500'}`}>
              {m === 'in' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        <div className="space-y-3 mt-4">
          <input className={inputCls} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          <input className={inputCls} type="password" placeholder="Password (6+ characters)" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          {err && <p className={`text-xs font-bold rounded-xl px-3 py-2 ${err.startsWith('Account created') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300'}`}>{err}</p>}
          <button className={btnPrimary + ' w-full'} onClick={go} disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in & sync' : 'Create account & sync'}</button>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            <span className="flex-1 border-t border-slate-200 dark:border-slate-700" />OR<span className="flex-1 border-t border-slate-200 dark:border-slate-700" />
          </div>
          <button
            className="w-full h-11 rounded-xl bg-black text-white text-sm font-extrabold flex items-center justify-center gap-2 hover:bg-slate-900 transition disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setErr('');
              setBusy(true);
              try {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'apple',
                  options: { redirectTo: window.location.origin },
                });
                if (error) throw error;
              } catch (e: any) {
                const m = String(e?.message ?? '');
                setErr(m.toLowerCase().includes('provider') ? 'Apple login is not switched on yet — enable it in Supabase (Auth → Providers → Apple).' : `Apple sign-in failed: ${m}`);
                setBusy(false);
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden>
              <path d="M16.36 12.76c0-2.3 1.88-3.4 1.97-3.46-1.08-1.57-2.75-1.79-3.34-1.81-1.42-.15-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.76 1.1 1.67 2.34 2.87 2.3 1.15-.05 1.58-.75 2.97-.75s1.78.75 3 .73c1.24-.02 2.02-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.42-.93-2.41-3.74zM14.16 5.6c.64-.78 1.07-1.86.95-2.94-.92.04-2.03.61-2.69 1.39-.59.68-1.11 1.77-.97 2.81 1.03.08 2.07-.52 2.71-1.26z" />
            </svg>
            Sign in with Apple
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-4">Use the SAME login on both devices. Your password never leaves your screen.</p>
      </div>
    </div>
  );
}
