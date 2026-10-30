'use client';

import { useEffect, useMemo, useState } from 'react';
import { isAdmin, ROLE_LABELS, ROLES, type AdminUserRecord, type Role } from '@proot/shared';
import { RequireRole } from '../../components/AdminShell';
import { Icon } from '../../components/Icon';
import { api, useApiError, useSession } from '../../lib/session';

const roleTone: Record<Role, string> = { USER: '', EVENT_MANAGER: 'warn', ADMIN: 'brand' };

export default function UsersPage() {
  return <RequireRole allowed={isAdmin}><Users /></RequireRole>;
}

function Users() {
  const { user: me } = useSession();
  const describe = useApiError();
  const [users, setUsers] = useState<AdminUserRecord[]>();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'good'; text: string } | null>(null);

  useEffect(() => {
    api.adminUsers().then(setUsers).catch((err) => setMessage({ tone: 'error', text: describe(err) }));
  }, [describe]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => (roleFilter === 'ALL' || u.role === roleFilter) && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)));
  }, [users, query, roleFilter]);

  async function changeRole(target: AdminUserRecord, role: Role) {
    if (role === target.role) return;
    if (!window.confirm(`Change ${target.email} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}?`)) return;
    setPending(target.id);
    setMessage(null);
    try {
      await api.setUserRole(target.id, role);
      setUsers((list) => list?.map((u) => (u.id === target.id ? { ...u, role } : u)));
      setMessage({ tone: 'good', text: `${target.name} is now ${ROLE_LABELS[role].toLowerCase()}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: describe(err) });
    } finally {
      setPending(null);
    }
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
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" /></label>
        <div className="segmented" role="radiogroup" aria-label="Filter by role">
          {(['ALL', ...ROLES] as const).map((r) => (
            <button key={r} role="radio" aria-checked={roleFilter === r} className={roleFilter === r ? 'active' : undefined} onClick={() => setRoleFilter(r)}>
              {r === 'ALL' ? 'All' : ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {message && <p className={`alert ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      <div className="panel">
        <div className="panel-head"><h2>Accounts</h2><span className="count">{users ? `${visible.length} of ${users.length}` : 'Loading…'}</span></div>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Dogs</th><th>Joined</th><th>Change role</th></tr></thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id}>
                <td className="strong">{u.name}{u.id === me?.id && <em className="you">you</em>}<small className="sub">{u.email}</small></td>
                <td><span className={`pill ${roleTone[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                <td>{u.petCount}</td>
                <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={pending === u.id || u.id === me?.id}
                    title={u.id === me?.id ? 'You can’t change your own role' : undefined}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    aria-label={`Role for ${u.email}`}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {users && visible.length === 0 && <tr><td colSpan={5} className="empty-row">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
