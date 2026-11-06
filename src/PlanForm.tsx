import { cloneElement,isValidElement,useState, type ReactNode,type ReactElement,type FormEvent } from 'react';
import { getSdk } from '@ervisio/plugin-sdk';
import { DestinationFields } from '@ervisio/plugin-sdk/destinations';
import { PathInput } from '@ervisio/plugin-sdk/paths';
import { t, local } from './i18n';
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

export function PlanForm({ initial, connections, supportsLogs, onClose, onSave }: { initial: Plan; connections: Connection[]; supportsLogs?: boolean; onClose(): void; onSave(plan: Plan): Promise<void> }) {
  const { Dialog } = getSdk().ui;
  const [plan, setPlan] = useState<Plan>(() => structuredClone(initial));
  const [folders, setFolders] = useState(initial.folders.join('\n'));
  const [excludes, setExcludes] = useState(initial.excludes?.join('\n') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const retention=['remote','local'].includes(plan.destination.kind||'remote')||(plan.destination.kind==='s3'&&!!plan.destination.retention);
  const addFolder=async()=>{try{const selected=await getSdk().files.pick?.({mode:'folder',title:t('folders')});if(selected){if(selected.path.startsWith('remote:'))throw new Error(local('Choose a source folder on this server.','Scegli una sorgente su questo server.'));setFolders(current=>[...new Set([...lines(current),selected.path])].join('\n'));}}catch(e){setError(e instanceof Error?e.message:t('failedAction'));}};
  const patch = (p: Partial<Plan>) => setPlan(current => ({ ...current, ...p }));
  const dbPatch = (index: number, p: Partial<Database>) => patch({ databases: plan.databases.map((db, i) => i === index ? { ...db, ...p } : db) });
  const lines = (s: string) => s.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const submit = async () => {
    const foldersValue = lines(folders);
    if (plan.mode !== 'databases' && !foldersValue.length) { setError(t('emptyFolders')); return; }
    if (plan.mode !== 'folders' && !plan.databases.length) { setError(t('emptyDatabases')); return; }
    setBusy(true); setError('');
    try { await onSave({ ...plan, keepLast:retention?Math.max(1,plan.keepLast):0, maxAge:retention?plan.maxAge:undefined, folders: plan.mode === 'databases' ? [] : foldersValue, excludes: lines(excludes), databases: plan.mode === 'folders' ? [] : plan.databases }); }
    catch (e) { setError(e instanceof Error ? e.message : t('failedAction')); }
    finally { setBusy(false); }
  };
  return <>
    <Dialog open title={t(initial.id ? 'editTitle' : 'newTitle')} size="lg" className="bk-dialog" onClose={() => { if (!busy) onClose(); }} dismissable={!busy} onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }} footer={<><button type="button" className="bk-button" disabled={busy} onClick={onClose}>{t('cancel')}</button><button type="submit" className="bk-button bk-primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></>}>
      <div className="bk-form">
        {error && <div role="alert" className="bk-error bk-wide">{error}</div>}
        <Field title={t('name')}><input autoFocus required maxLength={100} value={plan.name} onChange={e => patch({ name: e.target.value })} /></Field>
        <Field title={t('mode')}><select value={plan.mode} onChange={e => patch({ mode: e.target.value as Plan['mode'] })}><option value="folders">{t('folders')}</option><option value="databases">{t('databases')}</option><option value="both">{t('both')}</option></select></Field>
        {plan.mode !== 'databases' && <>
          <Field wide title={t('folders')}><textarea rows={3} placeholder="/srv/app\n/home/ubuntu/project" value={folders} onChange={e => setFolders(e.target.value)} /><button type="button" className="bk-button" onClick={()=>void addFolder()}>{t('browse')}</button><small>{t('foldersHint')}</small></Field>
          <Field wide title={t('excludes')}><textarea rows={2} placeholder="node_modules/**\n*.log" value={excludes} onChange={e => setExcludes(e.target.value)} /><small>{t('excludeHint')}</small></Field>
        </>}
        {plan.mode !== 'folders' && <section className="bk-wide bk-db-section"><div className="bk-section-head"><h4>{t('databases')}</h4><button type="button" className="bk-button" disabled={plan.databases.length >= 16} onClick={() => patch({ databases: [...plan.databases, { id: token(), kind: 'postgres', name: '', host: 'localhost', port: 5432, user: '' }] })}>+ {t('addDatabase')}</button></div>
          {plan.databases.map((db, index) => <div key={db.id} className="bk-db-row">
            <Field title={t('engine')}><select value={db.kind} onChange={e => { const kind = e.target.value as Database['kind']; dbPatch(index, { kind, port: kind === 'mysql' ? 3306 : 5432 }); }}><option value="postgres">PostgreSQL</option><option value="mysql">MySQL / MariaDB</option><option value="sqlite">SQLite</option></select></Field>
            <Field title={t('databaseName')}><input required value={db.name} maxLength={128} onChange={e => dbPatch(index, { name: e.target.value })} /></Field>
            {db.kind === 'sqlite' ? <div className="bk-wide"><PathInput label={t('sqlitePath')} required value={db.path || ''} onPathChange={path => dbPatch(index, { path })} placeholder="/srv/app/data.sqlite" /></div> : <>
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
        <div className="bk-wide"><DestinationFields value={plan.destination} onChange={destination=>patch({destination,keepLast:Math.max(1,plan.keepLast)})} connections={connections} allowRetention /></div>
        <h4 className="bk-wide">{t('scheduled')}</h4>
        <Field title={t('frequency')}><PeriodInput value={plan.frequency} onChange={frequency => patch({ frequency })} /></Field>
        <Field title={t('sizeLimit')}><input required type="number" min={1/1024} max="100" step="any" value={plan.maxBytes / 1024 ** 3} onChange={e => patch({ maxBytes: Math.round(Number(e.target.value) * 1024 ** 3) })} /></Field>
        {plan.frequency.unit === 'months' && <p className="bk-notice bk-wide">{t('monthly')}</p>}
        <h4 className="bk-wide">{t('retention')}</h4>
        {retention&&<><Field title={t('keepLast')}><input required type="number" min="1" max="365" value={plan.keepLast} onChange={e => patch({ keepLast: Number(e.target.value) })} /></Field>
        <Field title={t('maxAge')}><select aria-label={t('maxAge')} value={plan.maxAge ? 'age' : 'none'} onChange={e => patch({ maxAge: e.target.value === 'age' ? { value: 1, unit: 'months' } : undefined })}><option value="none">{t('noMaxAge')}</option><option value="age">{t('maxAge')}</option></select>{plan.maxAge && <PeriodInput value={plan.maxAge} onChange={maxAge => patch({ maxAge })} />}</Field>
        <p className="bk-notice bk-wide">{t('retentionHint')}</p></>}
        {!retention&&<p className="bk-notice bk-wide">{local('Automatic deletion is disabled for this destination.','La cancellazione automatica è disattivata per questa destinazione.')}</p>}
        {supportsLogs && <>
          <h4 className="bk-wide">ErvisioLogs</h4>
          <label className="bk-check bk-wide"><input type="checkbox" checked={!!plan.logs?.enabled} onChange={e => patch({ logs: { url: '', backups: true, deletions: true, stream: 'backup', ...plan.logs, enabled: e.target.checked } })} />{t('logsEnabled')}</label>
          {plan.logs?.enabled && <>
            <Field wide title={t('logsURL')}><input type="url" required value={plan.logs.url} placeholder="https://logs.example.com" onChange={e => patch({ logs: { ...plan.logs!, url: e.target.value } })} /></Field>
            <Field wide title={t('logsToken')}><input type="password" autoComplete="new-password" value={plan.logs.token || ''} placeholder={plan.logs.hasToken ? t('passwordSaved') : 'evl_…'} required={!plan.logs.hasToken} onChange={e => patch({ logs: { ...plan.logs!, token: e.target.value, clearToken: false } })} /></Field>
            <label className="bk-check"><input type="checkbox" checked={plan.logs.backups} onChange={e => patch({ logs: { ...plan.logs!, backups: e.target.checked } })} />{t('logsBackups')}</label>
            <label className="bk-check"><input type="checkbox" checked={plan.logs.deletions} onChange={e => patch({ logs: { ...plan.logs!, deletions: e.target.checked } })} />{t('logsDeletions')}</label>
            <Field title={t('logsStream')}><input maxLength={100} value={plan.logs.stream || ''} placeholder="backup" onChange={e => patch({ logs: { ...plan.logs!, stream: e.target.value } })} /></Field>
            <Field title={t('logsEnvironment')}><input maxLength={100} value={plan.logs.environment || ''} onChange={e => patch({ logs: { ...plan.logs!, environment: e.target.value } })} /></Field>
            <p className="bk-notice bk-wide">{t('logsHint')}</p>
          </>}
        </>}
      </div>
    </Dialog>
  </>;
}

