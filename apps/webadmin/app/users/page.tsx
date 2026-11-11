'use client';

import { useState } from 'react';
import { isAdmin, ROLE_LABELS, ROLES, type AdminUserRecord, type Role } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { relative } from '../../lib/format';
import { api, useApiError, useSession } from '../../lib/session';
import { FlashMessage, Pager, TableState, Thumb, usePagedList, type Flash } from '../../lib/ui';

const roleTone: Record<Role, string> = { USER: '', PROVIDER: 'good', EVENT_MANAGER: 'warn', ADMIN: 'brand' };

// The API filters by one `status`: a role, or "inactive".
const FILTERS = [
  { value: '', label: 'All users' },
  ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
  { value: 'inactive', label: 'Inactive only' },
];

export default function UsersPage() {
  return <RequireRole allowed={isAdmin}><Users /></RequireRole>;
}

function Users() {
  const { user: me } = useSession();
  const describe = useApiError();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(api.adminUsers, { q, status });
  const [pending, setPending] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  async function mutate(target: AdminUserRecord, action: () => Promise<unknown>, optimistic: (u: AdminUserRecord) => AdminUserRecord, success: string) {
    setPending(target.id);
    setFlash(null);
    list.patch(target.id, optimistic);
    try {
      await action();
      setFlash({ tone: 'good', text: success });
      // The row may no longer match the filter (e.g. a role change under a role filter).
      if (status) list.reload();
    } catch (err) {
      list.patch(target.id, () => target);
      setFlash({ tone: 'error', text: describe(err) });
    } finally {
      setPending(null);
    }
  }

  function changeRole(target: AdminUserRecord, role: Role) {
    if (role === target.role) return;
    if (!window.confirm(`Change ${target.email} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}?`)) return;
    void mutate(target, () => api.setUserRole(target.id, role), (u) => ({ ...u, role }), `${target.name} is now ${ROLE_LABELS[role].toLowerCase()}.`);
  }

  function toggleActive(target: AdminUserRecord) {
    const next = !target.isActive;
    const warning = next
      ? `Reactivate ${target.email}? They’ll be able to sign in again (their listings and services stay paused until they turn them back on).`
      : `Deactivate ${target.email}? They’ll be signed out everywhere, their active listings will be archived and their care services paused.`;
    if (!window.confirm(warning)) return;
    void mutate(target, () => api.setUserActive(target.id, next), (u) => ({ ...u, isActive: next }), `${target.name} was ${next ? 'reactivated' : 'deactivated'}.`);
  }

  return (
    <>
      <header className="header-row">
        <div>
          <p className="eyebrow">People</p>
          <h1>Users & roles</h1>
        </div>
      </header>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter users">
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      <FlashMessage flash={flash} />
      {list.error && list.items.length > 0 && <p className="alert" role="alert">{list.error}</p>}

      <div className="panel">
        <div className="panel-head"><h2>Accounts</h2><span className="count">{list.page ? `${list.page.total} ${list.page.total === 1 ? 'account' : 'accounts'}` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Dogs</th><th>Last login</th><th>Joined</th><th>Change role</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {list.items.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td className="strong">
                    <div className="cell-media">
                      <Thumb src={u.avatarUrl} alt={u.name} round />
                      <div>{u.name}{self && <em className="you">you</em>}<small className="sub">{u.email}{u.city ? ` · ${u.city}` : ''}</small></div>
                    </div>
                  </td>
                  <td><span className={`pill ${roleTone[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                  <td><span className={`pill ${u.isActive ? 'good' : 'bad'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td>{u.petCount}</td>
                  <td className="muted" title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : undefined}>{u.lastLoginAt ? relative(u.lastLoginAt) : 'Never'}</td>
                  <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={pending === u.id || self}
                      title={self ? 'You can’t change your own role' : undefined}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      aria-label={`Role for ${u.email}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="row-actions">
                    <button
                      className={`button ghost${u.isActive ? ' danger' : ''}`}
                      disabled={pending === u.id || self}
                      title={self ? 'You can’t deactivate your own account' : undefined}
                      onClick={() => toggleActive(u)}
                    >
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              );
            })}
            <TableState cols={8} loading={list.loading} error={list.error} hasRows={list.items.length > 0} empty={q || status ? 'No users match.' : 'No users yet.'} onRetry={list.reload} />
          </tbody>
        </table>
        {list.page && <Pager total={list.page.total} limit={list.limit} offset={list.offset} onChange={list.setOffset} loading={list.loading} />}
      </div>
    </>
  );
}
