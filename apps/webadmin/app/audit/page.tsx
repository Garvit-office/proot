'use client';

import { useEffect, useMemo, useState } from 'react';
import { isAdmin, type AuditRecord } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { relative } from '../../lib/format';
import { api, useApiError } from '../../lib/session';

const actionTone: Record<string, string> = { user: 'brand', pet: 'good', event: 'warn' };

export default function AuditPage() {
  return <RequireRole allowed={isAdmin}><Audit /></RequireRole>;
}

function Audit() {
  const describe = useApiError();
  const [rows, setRows] = useState<AuditRecord[]>();
  const [area, setArea] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminAudit(500).then(setRows).catch((err) => setError(describe(err)));
  }, [describe]);

  const areas = useMemo(() => ['all', ...new Set((rows ?? []).map((r) => r.action.split('.')[0]))], [rows]);
  const visible = (rows ?? []).filter((r) => area === 'all' || r.action.startsWith(`${area}.`));

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Audit log</h1>
        </div>
      </header>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Filter by area">
          {areas.map((a) => (
            <button key={a} role="radio" aria-checked={area === a} className={area === a ? 'active' : undefined} onClick={() => setArea(a)}>{a === 'all' ? 'All' : a}</button>
          ))}
        </div>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="panel">
        <div className="panel-head"><h2>Latest actions</h2><span className="count">{rows ? `${visible.length} entries` : 'Loading…'}</span></div>
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
            {rows && visible.length === 0 && <tr><td colSpan={4} className="empty-row">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
