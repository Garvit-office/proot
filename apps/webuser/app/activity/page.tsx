import { todayActivity, userPet } from '@proot/shared';
import { Icon, type IconName } from '../../components/Icon';

const typeIcons: Record<string, IconName> = {
  Walk: 'pin',
  Meal: 'bowl',
  Play: 'sparkle',
  Care: 'heart',
  Sleep: 'clock',
};

export default function ActivityPage() {
  return (
    <main className="wrap page-section">
      <header className="page-head">
        <p className="eyebrow">{userPet.name} · activity</p>
        <h1>Everything, in order.</h1>
        <p className="lede">Walks, meals, play, and care notes gathered into one quiet timeline.</p>
      </header>
      <div className="stats activity-stats">
        <div className="stat-card"><span>Walk</span><strong>2.1 km</strong><small>today</small></div>
        <div className="stat-card"><span>Rest</span><strong>11.4 h</strong><small>today</small></div>
        <div className="stat-card"><span>Play</span><strong>14 min</strong><small>today</small></div>
        <div className="stat-card"><span>Food</span><strong>310 kcal</strong><small>logged</small></div>
      </div>
      <ol className="timeline">
        {todayActivity.map((item) => (
          <li key={item.id}>
            <time>{item.at}</time>
            <span className="dot" data-type={item.type}><Icon name={typeIcons[item.type] ?? 'activity'} size={16} /></span>
            <div className="panel">
              <h2>{item.title}</h2>
              <p>{item.type} · {item.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
