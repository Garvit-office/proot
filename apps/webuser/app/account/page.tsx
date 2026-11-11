'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, ROLE_LABELS, type AddressInput, type AddressRecord } from '@proot/shared';
import { Icon } from '../../components/Icon';
import { ErrorNote, Notice, PageHead, PageLoading, Spinner, UserAvatar } from '../../components/ui';
import { errorMessage, useLoad, useRequireUser, useUpdateLocation } from '../../lib/hooks';
import { fileToAvatarDataUrl } from '../../lib/photo';
import { api, useSession } from '../../lib/session';

export default function AccountPage() {
  const { ready } = useRequireUser();
  if (!ready) return <PageLoading />;
  return (
    <main className="wrap page-section">
      <PageHead eyebrow="Account" title="Your details." lede="Profile, location, delivery addresses and security." />
      <div className="account-grid">
        <ProfileCard />
        <div style={{ display: 'grid', gap: 22 }}>
          <LocationCard />
          <PasswordCard />
        </div>
        <AddressesCard />
        <SessionsCard />
      </div>
    </main>
  );
}

function fieldErrors(error: unknown) {
  const out: Record<string, string> = {};
  if (error instanceof ApiRequestError) for (const f of error.fields) out[f.field] = f.message;
  return out;
}

function ProfileCard() {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setFields({ name: 'Enter your name.' });
    setBusy(true);
    setError('');
    setFields({});
    setSaved(false);
    try {
      setUser(await api.updateProfile({ name: name.trim(), phone: phone.trim(), city: city.trim() }));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeAvatar(file?: File) {
    if (!file) return;
    setAvatarBusy(true);
    setError('');
    try {
      setUser(await api.updateAvatar(await fileToAvatarDataUrl(file, 512)));
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t update your photo.'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      setUser(await api.updateAvatar(null));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save} noValidate>
      <h2>Profile</h2>
      <div className="avatar-edit">
        <label className="photo-drop" aria-label="Change your photo">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <UserAvatar name={user.name} url={null} size={96} />}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => changeAvatar(e.target.files?.[0])} disabled={avatarBusy} />
        </label>
        <div>
          <strong>{user.email}</strong>
          <p className="panel-muted">{ROLE_LABELS[user.role]} · member since {new Date(user.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}</p>
          {avatarBusy ? <Spinner label="Uploading…" /> : user.avatarUrl && <button type="button" className="link-button" onClick={removeAvatar}>Remove photo</button>}
        </div>
      </div>
      <label className={`field${fields.name ? ' invalid' : ''}`}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        {fields.name && <small className="field-error">{fields.name}</small>}
      </label>
      <label className={`field${fields.phone ? ' invalid' : ''}`}>
        Phone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91 98765 43210" />
        {fields.phone ? <small className="field-error">{fields.phone}</small> : <small className="field-hint">Shared with care providers you book and sellers you buy from.</small>}
      </label>
      <label className="field">
        City
        <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" maxLength={80} />
      </label>
      <ErrorNote error={error} />
      {saved && <Notice tone="good">Saved.</Notice>}
      <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  );
}

function LocationCard() {
  const { user } = useSession();
  const { request, busy, error } = useUpdateLocation();
  const [done, setDone] = useState(false);
  if (!user) return null;
  const has = user.lat != null && user.lng != null;
  return (
    <section className="panel">
      <h2>Location</h2>
      <p className="panel-muted">
        {has ? `Saved near ${user.lat!.toFixed(3)}, ${user.lng!.toFixed(3)}${user.city ? ` · ${user.city}` : ''}.` : 'No location saved yet. Distances, nearby parks and dog friends use it.'}
      </p>
      <ErrorNote error={error} />
      {done && !error && <Notice tone="good">Location updated.</Notice>}
      <button className="button secondary" disabled={busy} onClick={async () => setDone(await request())}>
        <Icon name="navigation" size={16} /> {busy ? 'Locating…' : has ? 'Update to my current location' : 'Use my location'}
      </button>
    </section>
  );
}

function PasswordCard() {
  const { changePassword } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError('The new passwords don’t match.');
    setBusy(true);
    setError('');
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Password</h2>
      <label className="field">Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="field">New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="field">Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      <ErrorNote error={error} />
      {done && <Notice tone="good">Password changed. Other devices have been signed out; this one stays signed in.</Notice>}
      <button className="button primary" disabled={busy || !current || !next}>{busy ? 'Changing…' : 'Change password'}</button>
    </form>
  );
}

const EMPTY_ADDRESS: AddressInput = { label: 'Home', fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false };

function AddressesCard() {
  const { user } = useSession();
  const { data, setData, error, reload } = useLoad(() => api.listAddresses(), []);
  const [editing, setEditing] = useState<AddressRecord | 'new' | null>(null);
  const [actionError, setActionError] = useState('');

  async function remove(a: AddressRecord) {
    if (!window.confirm(`Delete the “${a.label}” address?`)) return;
    setActionError('');
    try {
      await api.deleteAddress(a.id);
      setData((list) => list?.filter((x) => x.id !== a.id));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  function saved(record: AddressRecord) {
    setEditing(null);
    // Saving a default clears the flag elsewhere, so refetch for the true state.
    if (record.isDefault) reload();
    else setData((list) => (list?.some((x) => x.id === record.id) ? list.map((x) => (x.id === record.id ? record : x)) : [...(list ?? []), record]));
  }

  return (
    <section className="panel">
      <h2>Delivery addresses</h2>
      <ErrorNote error={error || actionError} onRetry={error ? reload : undefined} />
      {!data && !error && <Spinner />}
      {data && data.length === 0 && !editing && <p className="panel-muted">No saved addresses. Add one to check out faster.</p>}
      {data?.map((a) =>
        editing !== 'new' && editing?.id === a.id ? (
          <AddressForm key={a.id} initial={a} onCancel={() => setEditing(null)} onSaved={saved} />
        ) : (
          <div key={a.id} className="address-card">
            <header><strong>{a.label}</strong>{a.isDefault && <span className="chip brand">Default</span>}</header>
            <span>{a.fullName} · {a.phone}</span>
            <span className="muted">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</span>
            <div className="row-actions">
              <button className="button secondary small" onClick={() => setEditing(a)}><Icon name="edit" size={14} /> Edit</button>
              <button className="button danger small" onClick={() => remove(a)}><Icon name="trash" size={14} /> Delete</button>
            </div>
          </div>
        ),
      )}
      {editing === 'new' ? (
        <AddressForm initial={{ ...EMPTY_ADDRESS, fullName: user?.name ?? '', phone: user?.phone ?? '', city: user?.city ?? '', isDefault: !data?.length }} onCancel={() => setEditing(null)} onSaved={saved} />
      ) : (
        <button className="button secondary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add an address</button>
      )}
    </section>
  );
}

function AddressForm({ initial, onCancel, onSaved }: { initial: AddressInput & { id?: string }; onCancel: () => void; onSaved: (a: AddressRecord) => void }) {
  const [form, setForm] = useState<AddressInput>(() => {
    const { label, fullName, phone, line1, line2, city, state, pincode, isDefault } = initial;
    return { label, fullName, phone, line1, line2, city, state, pincode, isDefault };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => setFields({}), [form]);

  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(initial.id ? await api.updateAddress(initial.id, form) : await api.createAddress(form));
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  const input = (key: Exclude<keyof AddressInput, 'isDefault'>, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={`field${fields[key] ? ' invalid' : ''}`}>
      {label}
      <input value={form[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
      {fields[key] && <small className="field-error">{fields[key]}</small>}
    </label>
  );

  return (
    <form className="form-grid address-card" onSubmit={submit} noValidate>
      <div className="field-row">
        {input('label', 'Label', { placeholder: 'Home, Work…' })}
        {input('fullName', 'Full name', { autoComplete: 'name' })}
      </div>
      {input('phone', 'Phone', { autoComplete: 'tel' })}
      {input('line1', 'Address line 1', { autoComplete: 'address-line1' })}
      {input('line2', 'Address line 2 (optional)', { autoComplete: 'address-line2' })}
      <div className="field-row">
        {input('city', 'City', { autoComplete: 'address-level2' })}
        {input('state', 'State', { autoComplete: 'address-level1' })}
        {input('pincode', 'PIN code', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' })}
      </div>
      <label className="check-field"><input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /> Use as my default address</label>
      <ErrorNote error={error} />
      <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="button primary small" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        <button type="button" className="button secondary small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function SessionsCard() {
  const { signOut, signOutEverywhere } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function everywhere() {
    if (!window.confirm('Sign out of Proot on every device, including this one?')) return;
    setBusy(true);
    setError('');
    try {
      await signOutEverywhere();
      router.push('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Sessions</h2>
      <p className="panel-muted">Signed in somewhere you don’t recognise? Sign out everywhere, then change your password.</p>
      <ErrorNote error={error} />
      <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="button secondary" onClick={() => { signOut(); router.push('/'); }}><Icon name="logout" size={16} /> Sign out</button>
        <button className="button danger" disabled={busy} onClick={everywhere}>{busy ? 'Signing out…' : 'Sign out everywhere'}</button>
      </div>
    </section>
  );
}
