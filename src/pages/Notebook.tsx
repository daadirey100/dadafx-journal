import { useMemo, useState } from 'react';
import { toast } from '../lib/store';
import { uid, type NoteItem } from '../lib/types';
import { Badge, btnGhost, btnPrimary, Card, Empty, Field, PageHeader, inputCls } from '../components/ui';

export default function Notebook({ notes, setNotes }: { notes: NoteItem[]; setNotes: (n: NoteItem[]) => void }) {
  const [folder, setFolder] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(notes[0]?.id ?? null);
  const folders = useMemo(() => ['All', ...Array.from(new Set(notes.map(n => n.folder || 'General')))], [notes]);
  const list = notes.filter(n => (folder === 'All' || (n.folder || 'General') === folder) && (!q || (n.title + n.body + n.tags.join(' ')).toLowerCase().includes(q.toLowerCase())));
  const active = notes.find(n => n.id === sel) ?? null;

  const add = () => {
    const n: NoteItem = { id: uid(), title: 'Untitled note', body: '', folder: folder === 'All' ? 'General' : folder, tags: [], updatedAt: new Date().toISOString() };
    setNotes([n, ...notes]);
    setSel(n.id);
    toast.ok('Note created.');
  };

  const update = (patch: Partial<NoteItem>) => {
    if (!active) return;
    setNotes(notes.map(n => (n.id === active.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)));
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Playbooks & ideas" title="Notebook" sub="Setups, rules and observations — organised in folders + tags."
        right={<button className={btnPrimary} onClick={add}>+ New note</button>} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <input className={`${inputCls} mb-2`} placeholder="Search notes…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {folders.map(f => (
              <button key={f} onClick={() => setFolder(f)} className={`h-8 px-3 rounded-full text-xs font-semibold border ${folder === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>📁 {f}</button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {list.length === 0 && <Empty icon="📓" title="No notes" hint="Create your first playbook note." />}
            {list.map(n => (
              <button key={n.id} onClick={() => setSel(n.id)} className={`w-full text-left border rounded-md px-3 py-2 ${sel === n.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">{n.title}</p>
                <p className="text-[11px] text-slate-500 truncate">{n.body || 'Empty note…'}</p>
              </button>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          {!active ? <Empty icon="✍️" title="Select a note" hint="Choose a note on the left or create a new one." action={<button className={btnPrimary} onClick={add}>+ New note</button>} /> : (
            <div className="space-y-3">
              <input className="w-full font-display font-bold text-lg bg-transparent focus:outline-none text-slate-900 dark:text-white" value={active.title} onChange={e => update({ title: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <input className={`${inputCls} !w-40`} value={active.folder} onChange={e => update({ folder: e.target.value })} placeholder="Folder" />
                <input className={`${inputCls} !w-56`} value={active.tags.join(', ')} onChange={e => update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="tags, comma separated" />
                <button className={btnGhost} onClick={() => { setNotes(notes.filter(n => n.id !== active.id)); setSel(null); toast.info('Note deleted.'); }}>Delete</button>
              </div>
              <div className="flex flex-wrap gap-1">{active.tags.map(t => <Badge key={t} tone="indigo">#{t}</Badge>)}</div>
              <Field label="Note (supports plain text & checklist style)">
                <textarea rows={14} className={`${inputCls} !h-auto py-2 leading-relaxed`} value={active.body} onChange={e => update({ body: e.target.value })} placeholder="Write your playbook, rules, observations…" />
              </Field>
              <p className="text-[11px] text-slate-400">Last edited {new Date(active.updatedAt).toLocaleString()}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
