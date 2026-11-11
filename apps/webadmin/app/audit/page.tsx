'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAdmin, type AuditRecord } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { relative } from '../../lib/format';
import { TableState } from '../../lib/ui';
import { api, useApiError } from '../../lib/session';

const actionTone: Record<string, string> = { user: 'brand', pet: 'good', event: 'warn', product: 'warn', order: 'brand', service: 'good', booking: 'good', park: 'good', payment: 'brand' };

export default function AuditPage() {
  return <RequireRole allowed={isAdmin}><Audit /></RequireRole>;
}

function Audit() {
  const describe = useApiError();
  const [rows, setRows] = useState<AuditRecord[]>();
  const [area, setArea] = useState('all');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.adminAudit(500)
      .then((list) => {
        setRows(list);
        setError('');
      })
      .catch((err) => setError(describe(err)))
      .finally(() => setLoading(false));
  }, [describe]);
  useEffect(load, [load]);

  const areas = useMemo(() => ['all', ...new Set((rows ?? []).map((r) => r.action.split('.')[0]))], [rows]);
  const needle = q.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => (area === 'all' || r.action.startsWith(`${area}.`))
    && (!needle || `${r.action} ${r.details} ${r.actorName ?? ''} ${r.actorEmail ?? ''}`.toLowerCase().includes(needle)));

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Audit log</h1>
        </div>
      </header>
      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search actor or details" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" /></label>
        <button className="button ghost" onClick={load} disabled={loading}>Refresh</button>
        <div className="segmented" role="radiogroup" aria-label="Filter by area">
          {areas.map((a) => (
            <button key={a} role="radio" aria-checked={area === a} className={area === a ? 'active' : undefined} onClick={() => setArea(a)}>{a === 'all' ? 'All' : a}</button>
          ))}
        </div>
      </div>
      {error && rows && <p className="alert" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-head"><h2>Latest actions</h2><span className="count">{rows ? `${visible.length} of ${rows.length} latest` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="muted" title={new Date(r.createdAt).toLocaleString()}>{relative(r.createdAt)}</td>
                <td className="strong">{r.actorName ?? 'System'}{r.actorEmail && <small className="sub">{r.actorEmail}</small>}</td>
                <td><span className={`pill ${actionTone[r.action.split('.')[0]] ?? ''}`}>{r.action}</span></td>
                <td>{r.details}</td>
              </tr>
            ))}
            <TableState cols={4} loading={loading} error={rows ? '' : error} hasRows={visible.length > 0} empty={rows?.length ? 'No entries match.' : 'Nothing logged yet.'} onRetry={load} />
          </tbody>
        </table>
      </div>
    </>
  );
}
