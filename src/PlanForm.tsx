import { cloneElement,isValidElement,useEffect,useState, type ReactNode,type ReactElement,type FormEvent } from 'react';
import { getSdk } from '@ervisio/plugin-sdk';
import { browse } from './api';
import { t } from './i18n';
import { token, type Connection, type Database, type Period, type Plan, type Unit } from './model';

const units: Unit[] = ['minutes', 'hours', 'days', 'months'];
function Field({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  let controls=0;
  const label=(node:ReactNode):ReactNode=>{
    if(!isValidElement(node))return node;
    const element=node as ReactElement<Record<string,unknown>>;
    if(typeof element.type==='string'&&['input','select','textarea'].includes(element.type)){controls++;return cloneElement(element,{'aria-label':element.props['aria-label']||title+(controls>1?' '+controls:'')});}
    if(element.type===PeriodInput){controls++;return cloneElement(element,{label:title});}
    if(typeof element.type==='string'&&element.props.children)return cloneElement(element,{children:getSdk().react.Children.map(element.props.children as ReactNode,label)});
    return node;
  };
  return <label className={`bk-field${wide ? ' bk-wide' : ''}`}><span>{title}</span>{getSdk().react.Children.map(children,label)}</label>;
}
function PeriodInput({ value, onChange,label=t('frequency') }: { value: Period; onChange(v: Period): void;label?:string }) {
  return <span className="bk-period"><input aria-label={label} type="number" min="1" required value={value.value} onChange={e => onChange({ ...value, value: Number(e.target.value) })} /><select aria-label={label+' unit'} value={value.unit} onChange={e => onChange({ ...value, unit: e.target.value as Unit })}>{units.map(unit => <option key={unit} value={unit}>{t(unit)}</option>)}</select></span>;
}

export function PlanForm({ initial, connections, onClose, onSave }: { initial: Plan; connections: Connection[]; onClose(): void; onSave(plan: Plan): Promise<void> }) {
  const { Dialog } = getSdk().ui;
  const [plan, setPlan] = useState<Plan>(() => structuredClone(initial));
  const [folders, setFolders] = useState(initial.folders.join('\n'));
  const [excludes, setExcludes] = useState(initial.excludes?.join('\n') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [browser, setBrowser] = useState(false);
  const patch = (p: Partial<Plan>) => setPlan(current => ({ ...current, ...p }));
  const dbPatch = (index: number, p: Partial<Database>) => patch({ databases: plan.databases.map((db, i) => i === index ? { ...db, ...p } : db) });
  const lines = (s: string) => s.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const submit = async () => {
    const foldersValue = lines(folders);
    if (plan.mode !== 'databases' && !foldersValue.length) { setError(t('emptyFolders')); return; }
    if (plan.mode !== 'folders' && !plan.databases.length) { setError(t('emptyDatabases')); return; }
    setBusy(true); setError('');
    try { await onSave({ ...plan, folders: plan.mode === 'databases' ? [] : foldersValue, excludes: lines(excludes), databases: plan.mode === 'folders' ? [] : plan.databases }); }
    catch (e) { setError(e instanceof Error ? e.message : t('failedAction')); }
    finally { setBusy(false); }
  };
  return <>
    <Dialog open title={t(initial.id ? 'editTitle' : 'newTitle')} size="lg" className="bk-dialog" onClose={() => { if (!busy) onClose(); }} dismissable={!busy} onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }} footer={<><button type="button" className="bk-button" disabled={busy} onClick={onClose}>{t('cancel')}</button><button type="submit" className="bk-button bk-primary" disabled={busy || !connections.length}>{t(busy ? 'saving' : 'save')}</button></>}>
      <div className="bk-form">
        {error && <div role="alert" className="bk-error bk-wide">{error}</div>}
        <Field title={t('name')}><input autoFocus required maxLength={100} value={plan.name} onChange={e => patch({ name: e.target.value })} /></Field>
        <Field title={t('mode')}><select value={plan.mode} onChange={e => patch({ mode: e.target.value as Plan['mode'] })}><option value="folders">{t('folders')}</option><option value="databases">{t('databases')}</option><option value="both">{t('both')}</option></select></Field>
        {plan.mode !== 'databases' && <>
          <Field wide title={t('folders')}><textarea rows={3} placeholder="/srv/app\n/home/ubuntu/project" value={folders} onChange={e => setFolders(e.target.value)} /><small>{t('foldersHint')}</small></Field>
          <Field wide title={t('excludes')}><textarea rows={2} placeholder="node_modules/**\n*.log" value={excludes} onChange={e => setExcludes(e.target.value)} /><small>{t('excludeHint')}</small></Field>
        </>}
        {plan.mode !== 'folders' && <section className="bk-wide bk-db-section"><div className="bk-section-head"><h4>{t('databases')}</h4><button type="button" className="bk-button" disabled={plan.databases.length >= 16} onClick={() => patch({ databases: [...plan.databases, { id: token(), kind: 'postgres', name: '', host: 'localhost', port: 5432, user: '' }] })}>+ {t('addDatabase')}</button></div>
          {plan.databases.map((db, index) => <div key={db.id} className="bk-db-row">
            <Field title={t('engine')}><select value={db.kind} onChange={e => { const kind = e.target.value as Database['kind']; dbPatch(index, { kind, port: kind === 'mysql' ? 3306 : 5432 }); }}><option value="postgres">PostgreSQL</option><option value="mysql">MySQL / MariaDB</option><option value="sqlite">SQLite</option></select></Field>
            <Field title={t('databaseName')}><input required value={db.name} maxLength={128} onChange={e => dbPatch(index, { name: e.target.value })} /></Field>
            {db.kind === 'sqlite' ? <Field wide title={t('sqlitePath')}><input required value={db.path || ''} onChange={e => dbPatch(index, { path: e.target.value })} placeholder="/srv/app/data.sqlite" /></Field> : <>
              <Field title={t('host')}><input required value={db.host || ''} onChange={e => dbPatch(index, { host: e.target.value })} /></Field>
              <Field title={t('port')}><input required type="number" min="1" max="65535" value={db.port || ''} onChange={e => dbPatch(index, { port: Number(e.target.value) })} /></Field>
              <Field title={t('user')}><input required autoComplete="off" value={db.user || ''} onChange={e => dbPatch(index, { user: e.target.value })} /></Field>
              <Field title={t('password')}><input type="password" autoComplete="new-password" value={db.password || ''} placeholder={db.hasPassword ? t('passwordSaved') : ''} onChange={e => dbPatch(index, { password: e.target.value, clearPassword: false })} /></Field>
              {db.hasPassword && <label className="bk-check bk-wide"><input type="checkbox" checked={!!db.clearPassword} onChange={e => dbPatch(index, { clearPassword: e.target.checked, password: '' })} />{t('clearPassword')}</label>}
            </>}
            <button type="button" className="bk-button bk-danger" onClick={() => patch({ databases: plan.databases.filter((_, i) => i !== index) })}>{t('remove')}</button>
          </div>)}
        </section>}
        <h4 className="bk-wide">{t('destination')}</h4>
        {!connections.length && <p className="bk-notice bk-wide">{t('noConnections')}</p>}
        <Field title={t('connection')}><select required value={plan.destination.connection} onChange={e => { const connection = connections.find(item => item.id === e.target.value); patch({ destination: { connection: e.target.value, path: connection?.path || '/' } }); }}><option value="">—</option>{connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name} · {connection.kind.toUpperCase()}</option>)}</select></Field>
        <Field title={t('remotePath')}><span className="bk-period"><input required value={plan.destination.path} onChange={e => patch({ destination: { ...plan.destination, path: e.target.value } })} /><button type="button" className="bk-button" disabled={!plan.destination.connection} onClick={() => setBrowser(true)}>{t('browse')}</button></span></Field>
        <h4 className="bk-wide">{t('scheduled')}</h4>
        <Field title={t('frequency')}><PeriodInput value={plan.frequency} onChange={frequency => patch({ frequency })} /></Field>
        <Field title={t('sizeLimit')}><input required type="number" min={1/1024} max="100" step="any" value={plan.maxBytes / 1024 ** 3} onChange={e => patch({ maxBytes: Math.round(Number(e.target.value) * 1024 ** 3) })} /></Field>
        {plan.frequency.unit === 'months' && <p className="bk-notice bk-wide">{t('monthly')}</p>}
        <h4 className="bk-wide">{t('retention')}</h4>
        <Field title={t('keepLast')}><input required type="number" min="1" max="365" value={plan.keepLast} onChange={e => patch({ keepLast: Number(e.target.value) })} /></Field>
        <Field title={t('maxAge')}><select aria-label={t('maxAge')} value={plan.maxAge ? 'age' : 'none'} onChange={e => patch({ maxAge: e.target.value === 'age' ? { value: 1, unit: 'months' } : undefined })}><option value="none">{t('noMaxAge')}</option><option value="age">{t('maxAge')}</option></select>{plan.maxAge && <PeriodInput value={plan.maxAge} onChange={maxAge => patch({ maxAge })} />}</Field>
        <p className="bk-notice bk-wide">{t('retentionHint')}</p>
      </div>
    </Dialog>
    {browser && <RemoteBrowser connection={plan.destination.connection} initial={plan.destination.path} onClose={() => setBrowser(false)} onSelect={path => { patch({ destination: { ...plan.destination, path } }); setBrowser(false); }} />}
  </>;
}

function RemoteBrowser({ connection, initial, onClose, onSelect }: { connection: string; initial: string; onClose(): void; onSelect(path: string): void }) {
  const { Dialog } = getSdk().ui;
  const [path, setPath] = useState(initial || '/');
  const [directories, setDirectories] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (next: string) => { setLoading(true); setError(''); try { const data = await browse(connection, next); setPath(data.path); setDirectories(data.directories); } catch (e) { setError(e instanceof Error ? e.message : t('failedAction')); } finally { setLoading(false); } };
  useEffect(()=>{void load(initial||'/');},[connection,initial]);
  return <Dialog open title={t('selectFolder')} className="bk-dialog" onClose={onClose} footer={<><button className="bk-button" onClick={onClose}>{t('cancel')}</button><button className="bk-button bk-primary" disabled={loading || !!error} onClick={() => onSelect(path)}>{t('useFolder')}</button></>}>
    <div className="bk-browser"><div className="bk-section-head"><code>{path}</code><button className="bk-button" disabled={loading || path === '/'} onClick={() => void load(path.split('/').slice(0, -1).join('/') || '/')}>{t('up')}</button></div>
      {error && <p role="alert" className="bk-error">{error}</p>}{loading ? <p>{t('loading')}</p> : <div className="bk-folder-list">{directories.length ? directories.map(dir => <button className="bk-folder" key={dir.path} onClick={() => void load(dir.path)}>▰ <span>{dir.name}</span><span>›</span></button>) : <p className="bk-muted">{t('noSubfolders')}</p>}</div>}
    </div>
  </Dialog>;
}
