// Trail Torque interface (React). Screens: home, regions, tracks, garage,
// profile, achievements, settings. The 3D drive and the classic 2D game are
// separate canvases that this shell starts and returns from.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Backdrop from './Backdrop.jsx';
import GaragePreview from './GaragePreview.jsx';
import { useSave, act, bus, sfx } from './store.js';
import { REGIONS } from '../drive/tracks/regions.js';
import { TRACK_META } from '../drive/tracks/meta.js';
import { WEATHER, TIRES } from '../drive/core/surfaces.js';
import { DIFFICULTY, fmtTime } from '../drive/core/session.js';
import { isTrackUnlocked, isRegionUnlocked, regionProgress, playerLevel, ACHIEVEMENTS, dailyChallenge } from '../drive/core/progress.js';
import { UPGRADE_INFO, GEAR_INFO, buildParams } from '../drive/core/specs.js';
import { launchDrive } from '../drive/launch.js';
import { VEHICLES, PAINTS } from '../game/config/vehicles.js';
import { MAX_UPGRADE, UPGRADE_KEYS, GEAR_KEYS, TIRE_IDS, upgradeCost } from '../game/core/saveModel.js';
import { DEBUG, UNLOCK_ALL_TRACKS } from '../game/config/constants.js';
import { vibrate } from '../game/systems/platform.js';

const coins = (n) => Math.round(n).toLocaleString('en-US');
const clock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const HOURS = { morning: 8, day: 13, dusk: 18.2, night: 23 };
function whenLabel(t) {
  if (t.hours) return `${clock(t.hours[0])} → ${clock(t.hours[1])}`;
  return t.time ? t.time[0].toUpperCase() + t.time.slice(1) : 'Day';
}
function weatherLabel(t) {
  if (t.weatherPlan) return t.weatherPlan.map((p) => WEATHER[p[1]].name).join(' → ');
  return WEATHER[t.weather].name;
}
const endsAtNight = (t) => (t.hours ? t.hours[1] : HOURS[t.time] || 13) >= 19.4;
const MEDAL = ['', 'Bronze', 'Silver', 'Gold'];

function nextTrack(save) {
  return TRACK_META.find((t) => !save.tracks[t.id]?.done && (DEBUG || UNLOCK_ALL_TRACKS || isTrackUnlocked(save, t.id))) || TRACK_META[TRACK_META.length - 1];
}

// ----------------------------------------------------------------- pieces
function Btn({ children, onClick, kind = '', disabled, className = '', ...rest }) {
  return (
    <button className={`btn ${kind} ${className}`} disabled={disabled} onClick={(e) => { if (disabled) { sfx.deny(); return; } sfx.click(); onClick && onClick(e); }} {...rest}>
      {children}
    </button>
  );
}
function TopBar({ title, onBack, save, right }) {
  const lvl = playerLevel(save.xp);
  const cur = 120 * (lvl - 1) ** 2, next = 120 * lvl ** 2;
  return (
    <header className="topbar">
      {onBack ? <Btn kind="ghost" onClick={onBack} aria-label="Back">&#8592; Back</Btn> : <span className="brand-s">TRAIL TORQUE</span>}
      <h1>{title}</h1>
      <div className="wallet">
        {right}
        <div className="lvl" title={`${save.xp} XP`}><b>LVL {lvl}</b><i><u style={{ width: `${Math.min(100, ((save.xp - cur) / (next - cur)) * 100)}%` }} /></i></div>
        <div className="coin"><span className="dot" />{coins(save.coins)}</div>
      </div>
    </header>
  );
}
/** If a screen fails to draw, say so and offer the way home instead of leaving a black screen. */
class ScreenGuard extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Screen failed to draw:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: '2em' }}>
        <div>
          <h2>This screen could not be shown</h2>
          <p style={{ opacity: 0.75, margin: '0.6em 0 1.2em' }}>{String(this.state.error && this.state.error.message || this.state.error)}</p>
          <button className="cta" onClick={() => { this.setState({ error: null }); this.props.onHome(); }}><strong>Back to the main menu</strong></button>
        </div>
      </div>
    );
  }
}

/** A difficulty by id; anything unknown (an old save) is Standard, never a crash. */
const diffOf = (id) => DIFFICULTY[id] || DIFFICULTY.standard;
function Stars({ n, of }) { return <span className="stars">{'★'.repeat(n)}<em>{'★'.repeat(Math.max(0, of - n))}</em></span>; }

// ------------------------------------------------------------------- home
function Home({ go, save, shell, onDrive }) {
  const nt = nextTrack(save);
  const rs = save.resume && TRACK_META.find((t) => t.id === save.resume.trackId) ? save.resume : null;
  const rsMeta = rs && TRACK_META.find((t) => t.id === rs.trackId);
  const dc = dailyChallenge(save);
  const dcMeta = TRACK_META.find((t) => t.id === dc.trackId);
  const region = REGIONS.find((r) => r.id === nt.region);
  const done = TRACK_META.filter((t) => save.tracks[t.id]?.done).length;
  const veh = save.selectedVehicle;
  return (
    <div className="screen home">
      <Backdrop region={nt.env || region.id} dim={0.5} />
      <TopBar title="" save={save} />
      <div className="home-grid">
        <div className="home-left">
          <div className="logo"><span>TRAIL</span><b>TORQUE</b></div>
          <p className="tag">Eight regions. Forty expeditions. Five open tours. One coast run.</p>
          {rs && (
            <button className="cta" style={{ marginBottom: '0.6em' }} onClick={() => { sfx.go(); onDrive(rs.trackId, rs.difficulty, undefined, { resume: true }); }}>
              <small>RESUME YOUR RUN</small>
              <strong>{rsMeta.name}</strong>
              <span>From checkpoint {rs.cp} &middot; {DIFFICULTY[rs.difficulty]?.name || 'Standard'}</span>
            </button>
          )}
          <button className="cta" onClick={() => { sfx.go(); go('tracks', { region: region.id, track: nt.id }); }}>
            <small>{done === 0 ? 'START EXPEDITION' : done >= TRACK_META.length ? 'REPLAY' : 'CONTINUE EXPEDITION'}</small>
            <strong>{nt.name}</strong>
            <span>{region.name} &middot; Track {TRACK_META.indexOf(nt) + 1} of {TRACK_META.length}</span>
          </button>
          <nav className="tiles">
            <Btn kind="tile" onClick={() => go('regions')}><b>Expedition</b><span>{done}/{TRACK_META.length} tracks</span></Btn>
            <Btn kind="tile" onClick={() => go('tracks', { region: dcMeta.region, track: dc.trackId })}><b>Daily challenge</b><span>{dc.done ? 'Done - back tomorrow' : `${dcMeta.name} · +${coins(dc.bonus)}`}</span></Btn>
            <Btn kind="tile" onClick={() => go('garage')}><b>Garage</b><span>Upgrades &amp; tyres</span></Btn>
            <Btn kind="tile" onClick={() => go('profile')}><b>Profile</b><span>{(save.stats.distance / 1000).toFixed(1)} km driven</span></Btn>
            <Btn kind="tile" onClick={() => go('achievements')}><b>Achievements</b><span>{Object.keys(save.achievements).length}/{ACHIEVEMENTS.length}</span></Btn>
            <Btn kind="tile" onClick={() => go('settings')}><b>Settings</b><span>Graphics &amp; controls</span></Btn>
            <Btn kind="tile" onClick={() => shell.openClassic()}><b>Classic 2D</b><span>The original hill-climb</span></Btn>
          </nav>
        </div>
        <div className="home-right">
          <GaragePreview vehicleId={veh} ups={save.upgrades[veh]} gear={save.gear[veh]} tire={save.tires[veh].sel} paint={save.paint[veh].sel} />
          <div className="veh-tag">{VEHICLES.find((v) => v.id === veh).name}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- regions
function Regions({ go, back, save }) {
  return (
    <div className="screen">
      <Backdrop region="rocky" dim={0.78} />
      <TopBar title="Choose a region" onBack={back} save={save} />
      <div className="region-row">
        {REGIONS.map((r, i) => {
          const open = DEBUG || UNLOCK_ALL_TRACKS || isRegionUnlocked(save, r.id);
          const pr = regionProgress(save, r.id);
          return (
            <button key={r.id} className={`region-card${open ? '' : ' locked'}`} style={{ '--accent': r.color }}
              onClick={() => { if (!open) { sfx.deny(); return; } sfx.click(); go('tracks', { region: r.id }); }}>
              <Backdrop region={r.open ? 'ridge' : r.id} dim={open ? 0.18 : 0.72} />
              <div className="rc-top"><span className="num">{String(r.n).padStart(2, '0')}</span><span className="lvl-badge">{r.level}</span></div>
              <div className="rc-body">
                <h2>{r.name}</h2>
                <p>{r.desc}</p>
                {open
                  ? <div className="rc-prog"><i><u style={{ width: `${(pr.done / pr.total) * 100}%` }} /></i><span>{pr.done}/{pr.total} tracks</span></div>
                  : <div className="rc-lock">&#128274; Finish {REGIONS[i - 1].name}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- tracks
function Tracks({ go, back, save, params, shell, onDrive }) {
  const region = REGIONS.find((r) => r.id === params.region) || REGIONS[0];
  const list = TRACK_META.filter((t) => t.region === region.id);
  const firstOpen = list.find((t) => !save.tracks[t.id]?.done && (DEBUG || UNLOCK_ALL_TRACKS || isTrackUnlocked(save, t.id))) || list[0];
  const [sel, setSel] = useState(params.track && list.find((t) => t.id === params.track) ? params.track : firstOpen.id);
  const [diff, setDiff] = useState(diffOf(save.settings.difficulty).id);
  const dc = dailyChallenge(save);
  const t = list.find((x) => x.id === sel) || list[0];
  const open = DEBUG || UNLOCK_ALL_TRACKS || isTrackUnlocked(save, t.id);
  const rec = save.tracks[t.id];
  const n = TRACK_META.indexOf(t) + 1;
  const veh = VEHICLES.find((v) => v.id === save.selectedVehicle);
  const objTotal = 5;
  const rs = save.resume && save.resume.trackId === t.id ? save.resume : null;
  const isDaily = dc.trackId === t.id && !dc.done;
  return (
    <div className="screen tracks" style={{ '--accent': region.color }}>
      <Backdrop region={t.env || region.id} dim={0.7} />
      <TopBar title={region.name} onBack={back} save={save} right={<Btn kind="ghost" onClick={() => go('garage')}>Garage</Btn>} />
      <div className="tracks-grid">
        <ol className="track-list">
          {list.map((x) => {
            const o = DEBUG || UNLOCK_ALL_TRACKS || isTrackUnlocked(save, x.id);
            const r = save.tracks[x.id];
            return (
              <li key={x.id}>
                <button className={`track-row${x.id === sel ? ' sel' : ''}${o ? '' : ' locked'}`} onClick={() => { sfx.click(); setSel(x.id); }}>
                  <span className="num">{String(TRACK_META.indexOf(x) + 1).padStart(2, '0')}</span>
                  <span className="tr-main"><b>{x.name}</b><small>{o ? `${weatherLabel(x)} · ${whenLabel(x)}` : 'Locked'}</small></span>
                  <span className="tr-state">{!o ? '\u{1F512}' : r?.done ? <><Stars n={r.stars} of={objTotal} /><small>{fmtTime(r.bestTime)}</small></> : <em>NEW</em>}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <section className="track-detail" key={t.id}>
          <div className="td-head">
            <span className="num big">{String(n).padStart(2, '0')}</span>
            <div><h2>{t.name}</h2><p>{t.blurb}</p></div>
          </div>
          <div className="chips">
            <span><small>Weather</small>{weatherLabel(t)}</span>
            <span><small>Time of day</small>{whenLabel(t)}{endsAtNight(t) ? ' ☾' : ''}</span>
            <span><small>Gold time</small>{fmtTime(t.par.gold)}</span>
            <span><small>Reward</small>{coins(t.reward * diffOf(diff).reward)}</span>
            {isDaily && <span className="wide" style={{ borderColor: '#ffd23f' }}><small>Daily challenge</small>Finish today for +{coins(dc.bonus)}</span>}
            <span className="wide"><small>Recommended</small>{t.rec}</span>
            <span className="wide"><small>Your truck</small>{veh.name} &middot; {TIRES[save.tires[veh.id].sel].name}</span>
          </div>
          {rec?.done && (rec.times || []).length > 0 && (
            <p className="diff-desc" style={{ margin: '0.2em 0' }}>Your best times: {rec.times.map((x, i) => `${i + 1}. ${fmtTime(x.t)}`).join('   ')}{save.ghosts[t.id] ? '  ·  your ghost races you' : ''}</p>
          )}
          {rec?.done && (
            <div className="record">
              <b>Best {fmtTime(rec.bestTime)}</b>{rec.medal ? <span className={`medal m${rec.medal}`}>{MEDAL[rec.medal]}</span> : null}
              <Stars n={rec.stars} of={objTotal} />
              <span>Caches {rec.caches.filter(Boolean).length}/{rec.caches.length} &middot; Relics {(rec.relics || []).filter(Boolean).length}/3{rec.diff ? ` · ${diffOf(rec.diff).name}` : ''}</span>
            </div>
          )}
          <div className="diff" style={{ gridTemplateColumns: `repeat(${Object.keys(DIFFICULTY).length}, 1fr)` }}>
            {Object.values(DIFFICULTY).map((d) => (
              <button key={d.id} className={diff === d.id ? 'on' : ''} onClick={() => { sfx.click(); setDiff(d.id); act((S) => S.setSetting('difficulty', d.id)); }}>
                <b>{d.name}</b><small>x{d.reward} rewards</small>
              </button>
            ))}
          </div>
          <p className="diff-desc">{diffOf(diff).desc}</p>
          {open && rs && (
            <button className="cta start" style={{ marginBottom: '0.5em' }} onClick={() => { sfx.go(); onDrive(t.id, rs.difficulty, undefined, { resume: true }); }}>
              <strong>RESUME</strong><span>From checkpoint {rs.cp} &middot; {DIFFICULTY[rs.difficulty]?.name || 'Standard'}</span>
            </button>
          )}
          {open
            ? <button className="cta start" onClick={() => { sfx.go(); onDrive(t.id, diff); }}><strong>{rs ? 'START OVER' : rec?.done ? 'DRIVE AGAIN' : 'START'}</strong><span>8-15 minutes &middot; every checkpoint saves your run</span></button>
            : <div className="locked-note">&#128274; Finish &ldquo;{TRACK_META[n - 2]?.name}&rdquo; to unlock this track.</div>}
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- garage
function Garage({ back, save, params, onTestDrive }) {
  const [idx, setIdx] = useState(Math.max(0, VEHICLES.findIndex((v) => v.id === (params?.vehicle || save.selectedVehicle))));
  const [tab, setTab] = useState('upgrades');
  const spec = VEHICLES[idx];
  const owned = save.unlockedVehicles.includes(spec.id);
  const ups = save.upgrades[spec.id], gear = save.gear[spec.id], tires = save.tires[spec.id];
  const P = buildParams(spec.id, ups, { ...gear, tire: tires.sel });
  const buy = (ok) => { if (ok) { sfx.buy(); vibrate(20); } else sfx.deny(); };
  const step = (d) => { sfx.click(); setIdx((idx + d + VEHICLES.length) % VEHICLES.length); };
  return (
    <div className="screen garage">
      <Backdrop region="rocky" dim={0.86} />
      <TopBar title="Garage" onBack={back} save={save} />
      <div className="garage-grid">
        <section className="g-stage">
          <div className="veh-selector-bar">
            {VEHICLES.map((v, i) => (
              <button
                key={v.id}
                className={`veh-pill ${i === idx ? 'active' : ''}`}
                onClick={() => { sfx.click(); setIdx(i); }}
              >
                {v.name}
              </button>
            ))}
          </div>
          <GaragePreview vehicleId={spec.id} ups={ups} gear={gear} tire={tires.sel} paint={save.paint[spec.id].sel} locked={!owned} />
          <button className="arrow l" onClick={() => step(-1)} aria-label="Previous vehicle">&#8249;</button>
          <button className="arrow r" onClick={() => step(1)} aria-label="Next vehicle">&#8250;</button>
          <div className="g-name">
            <h2>{spec.name}</h2><p>{spec.desc}</p>
            <div className="specs">
              <span><b>{Math.round(P.power / 1000)}</b>kW</span><span><b>{P.mass}</b>kg</span>
              <span><b>{Math.round(P.clearance * 100)}</b>cm clear.</span><span><b>{Math.round(P.travel * 100)}</b>cm travel</span>
              <span><b>{Math.round(P.fuelCap)}</b>L</span>
            </div>
            {!owned ? (
              <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                <Btn kind={save.coins >= spec.price ? 'gold' : ''} disabled={save.coins < spec.price} onClick={() => buy(act((S) => S.buyVehicle(spec)))}>Buy &middot; {coins(spec.price)}</Btn>
                <Btn kind="ghost" onClick={() => onTestDrive(spec.id)} title={`One run on ${TRACK_META[0].name}, stock setup, no rewards`}>Test Drive</Btn>
              </div>
            ) : save.selectedVehicle === spec.id ? (
              <span className="pill on">Selected</span>
            ) : (
              <Btn kind="primary" onClick={() => act((S) => S.selectVehicle(spec.id))}>Select this truck</Btn>
            )}
          </div>
          <span className="hint">Drag to rotate</span>
        </section>
        <section className="g-panel">
          <div className="tabs">
            <button className={tab === 'upgrades' ? 'on' : ''} onClick={() => { sfx.click(); setTab('upgrades'); }}>Upgrades</button>
            <button className={tab === 'gear' ? 'on' : ''} onClick={() => { sfx.click(); setTab('gear'); }}>Tyres &amp; gear</button>
            <button className={tab === 'paint' ? 'on' : ''} onClick={() => { sfx.click(); setTab('paint'); }}>Paint</button>
          </div>
          {!owned && <p className="empty">Buy this vehicle to equip it.</p>}
          {owned && tab === 'upgrades' && UPGRADE_KEYS.map((k) => {
            const lv = ups[k], max = lv >= MAX_UPGRADE, cost = max ? 0 : upgradeCost(k, lv);
            return (
              <div className="item" key={k}>
                <div><b>{UPGRADE_INFO[k].label}</b><small>{UPGRADE_INFO[k].hint}</small>
                  <i className="pips">{Array.from({ length: MAX_UPGRADE }, (_, p) => <u key={p} className={p < lv ? 'on' : ''} />)}</i></div>
                {max ? <span className="pill on">Max</span>
                  : <Btn kind={save.coins >= cost ? 'gold' : ''} disabled={save.coins < cost} onClick={() => buy(act((S) => S.buyUpgrade(spec.id, k)))}>{coins(cost)}</Btn>}
              </div>
            );
          })}
          {owned && tab === 'paint' && PAINTS.map((p) => {
            const pt = save.paint[spec.id], has = pt.owned.includes(p.id), on = pt.sel === p.id;
            const sw = p.main !== undefined ? p.main : spec.colors.main;
            return (
              <div className="item" key={p.id}>
                <div><b><span style={{ display: 'inline-block', width: '0.9em', height: '0.9em', borderRadius: '50%', marginRight: '0.5em', verticalAlign: '-0.08em', background: `#${sw.toString(16).padStart(6, '0')}`, border: '1px solid rgba(255,255,255,.5)' }} />{p.name}</b><small>{p.id === 'stock' ? 'The colour it left the factory in.' : 'Cosmetic. Applies to this vehicle.'}</small></div>
                {on ? <span className="pill on">Applied</span>
                  : has ? <Btn kind="primary" onClick={() => act((S) => S.selectPaint(spec.id, p.id))}>Apply</Btn>
                    : <Btn kind={save.coins >= p.price ? 'gold' : ''} disabled={save.coins < p.price} onClick={() => buy(act((S) => S.buyPaint(spec.id, p.id, p.price)))}>{coins(p.price)}</Btn>}
              </div>
            );
          })}
          {owned && tab === 'gear' && <>
            {TIRE_IDS.map((id) => {
              const t = TIRES[id], has = tires.owned.includes(id), on = tires.sel === id;
              return (
                <div className="item" key={id}>
                  <div><b>{t.name}</b><small>{t.desc}</small></div>
                  {on ? <span className="pill on">Fitted</span>
                    : has ? <Btn kind="primary" onClick={() => act((S) => S.selectTire(spec.id, id))}>Fit</Btn>
                      : <Btn kind={save.coins >= t.price ? 'gold' : ''} disabled={save.coins < t.price} onClick={() => buy(act((S) => S.buyTire(spec.id, id, t.price)))}>{coins(t.price)}</Btn>}
                </div>
              );
            })}
            {GEAR_KEYS.map((k) => {
              const g = GEAR_INFO[k], has = gear[k];
              return (
                <div className="item" key={k}>
                  <div><b>{g.label}</b><small>{g.hint}</small></div>
                  {has ? <span className="pill on">Fitted</span>
                    : <Btn kind={save.coins >= g.price ? 'gold' : ''} disabled={save.coins < g.price} onClick={() => buy(act((S) => S.buyGear(spec.id, k, g.price)))}>{coins(g.price)}</Btn>}
                </div>
              );
            })}
          </>}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- profile
function Profile({ back, save }) {
  const st = save.stats;
  const recs = Object.values(save.tracks);
  const hrs = st.driveTime / 3600;
  const cells = [
    ['Tracks completed', `${recs.filter((r) => r.done).length} / ${TRACK_META.length}`],
    ['Distance driven', `${(st.distance / 1000).toFixed(1)} km`],
    ['Time at the wheel', hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(st.driveTime / 60)} min`],
    ['Gold medals', recs.filter((r) => r.medal === 3).length],
    ['Silver / Bronze', `${recs.filter((r) => r.medal === 2).length} / ${recs.filter((r) => r.medal === 1).length}`],
    ['Clean runs', st.cleanRuns],
    ['Recoveries used', st.recoveries],
    ['Supply caches', st.caches],
    ['Hidden relics', `${st.relics || 0} / ${TRACK_META.length * 3}`],
    ['Hardcore finishes', st.hardcore || 0],
    ['Coins earned', coins(st.totalCoins)],
    ['Classic 2D best', `${save.bestDistance} m`]
  ];
  return (
    <div className="screen">
      <Backdrop region="ridge" dim={0.84} />
      <TopBar title="Profile" onBack={back} save={save} />
      <div className="scroll">
        <div className="stat-grid">{cells.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
        <h3 className="sub">Regions</h3>
        <div className="reg-bars">
          {REGIONS.map((r) => {
            const pr = regionProgress(save, r.id);
            const best = TRACK_META.filter((t) => t.region === r.id).reduce((s, t) => s + (save.tracks[t.id]?.stars || 0), 0);
            return <div key={r.id} style={{ '--accent': r.color }}><b>{r.name}</b><i><u style={{ width: `${(pr.done / pr.total) * 100}%` }} /></i><span>{pr.done}/{pr.total} &middot; {best}/25 &#9733;</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function Achievements({ back, save }) {
  return (
    <div className="screen">
      <Backdrop region="snow" dim={0.86} />
      <TopBar title="Achievements" onBack={back} save={save} />
      <div className="scroll">
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = !!save.achievements[a.id];
            return <div key={a.id} className={`ach${got ? ' got' : ''}`}><span className="badge">{got ? '★' : '\u{1F512}'}</span><div><b>{a.name}</b><small>{a.desc}</small></div></div>;
          })}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- settings
function Settings({ back, save }) {
  const s = save.settings;
  const [armed, setArmed] = useState(false);
  const cyc = (key, list) => act((S) => S.setSetting(key, list[(list.indexOf(s[key] ?? list[0]) + 1) % list.length]));
  const Row = ({ label, hint, value, onClick }) => (
    <div className="item"><div><b>{label}</b><small>{hint}</small></div><Btn kind="primary" onClick={onClick}>{value}</Btn></div>
  );
  const sens = s.steerSens || 1;
  return (
    <div className="screen">
      <Backdrop region="forest" dim={0.86} />
      <TopBar title="Settings" onBack={back} save={save} />
      <div className="scroll narrow">
        <Row label="Graphics quality" hint="Auto picks Medium on phones and High on desktop. Ultra enables 4K shadows, bloom and extended draw distance." value={(s.quality || 'auto').toUpperCase()} onClick={() => cyc('quality', ['auto', 'low', 'medium', 'high', 'ultra'])} />
        <Row label="Steering control" hint="Buttons, an analog slider you drag left and right, or tilting the phone like a wheel. A gamepad always works." value={(s.steerMode || 'buttons').toUpperCase()} onClick={() => cyc('steerMode', ['buttons', 'slider', 'tilt'])} />
        <Row label="Steering speed" hint="How fast the wheels follow the steering buttons." value={sens < 0.9 ? 'SLOW' : sens > 1.2 ? 'FAST' : 'NORMAL'} onClick={() => cyc('steerSens', [0.7, 1, 1.35])} />
        <Row label="Camera shake" hint="Shake on rough ground and impacts." value={s.camShake === false ? 'OFF' : 'ON'} onClick={() => act((S) => S.setSetting('camShake', s.camShake === false))} />
        <Row label="Driving display" hint={s.hud === 'full' ? 'Everything: tilt gauge, rev bar, gear and surface, challenge tips.' : 'Only what you need: speed, fuel, damage, time and the map.'} value={s.hud === 'full' ? 'FULL' : 'SIMPLE'} onClick={() => cyc('hud', ['simple', 'full'])} />
        <Row label="Default difficulty" hint={diffOf(s.difficulty).desc} value={diffOf(s.difficulty).name.toUpperCase()} onClick={() => cyc('difficulty', ['casual', 'standard', 'hardcore'])} />
        <Row label="Sound" hint="Engine, tyres, weather and interface sounds." value={s.sound ? 'ON' : 'OFF'} onClick={() => act((S) => S.setSetting('sound', !s.sound))} />
        <Row label="Vibration" hint="Haptic feedback on impacts (phones)." value={s.vibration ? 'ON' : 'OFF'} onClick={() => { act((S) => S.setSetting('vibration', !s.vibration)); vibrate(60); }} />
        <Row label="Show frame rate" hint="FPS counter in the driving HUD." value={s.showFps ? 'ON' : 'OFF'} onClick={() => act((S) => S.setSetting('showFps', !s.showFps))} />
        <div className="item danger"><div><b>Reset all progress</b><small>Deletes coins, vehicles, upgrades and every record. Cannot be undone.</small></div>
          <Btn kind={armed ? 'danger' : ''} onClick={async () => {
            if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3500); return; }
            await act((S) => S.reset()); setArmed(false); back();
          }}>{armed ? 'TAP AGAIN TO CONFIRM' : 'RESET'}</Btn></div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- app
export default function App({ shell }) {
  const save = useSave();
  const [route, setRoute] = useState({ name: 'home', params: {} });
  const [stack, setStack] = useState([]);
  const [mode, setMode] = useState('ui');      // ui | drive | classic
  const go = useCallback((name, params = {}) => { setStack((s) => [...s, route]); setRoute({ name, params }); }, [route]);
  const back = useCallback(() => {
    setStack((s) => {
      if (!s.length) { if (route.name === 'home') shell.exitApp(); else setRoute({ name: 'home', params: {} }); return s; }
      setRoute(s[s.length - 1]);
      return s.slice(0, -1);
    });
  }, [route, shell]);

  useEffect(() => bus.on('back', () => { sfx.click(); back(); }), [back]);
  useEffect(() => bus.on('classic', (on) => setMode(on ? 'classic' : 'ui')), []);

  const drive = useCallback((trackId, difficulty, testVehicle, extra = {}) => {
    setMode('drive');
    launchDrive({
      trackId, difficulty, testVehicle, audioCtx: shell.audioCtx(),
      resume: extra.resume ? save.resume : null,
      onExit: (action, id) => {
        const meta = TRACK_META.find((t) => t.id === id);
        const nextId = TRACK_META[TRACK_META.indexOf(meta) + 1]?.id;
        if (action === 'retry') { setTimeout(() => drive(id, difficulty, testVehicle), 30); return; }
        if (testVehicle) { setMode('ui'); setStack([{ name: 'home', params: {} }]); setRoute({ name: 'garage', params: { vehicle: testVehicle } }); return; }
        if (action === 'next' && nextId) { setTimeout(() => drive(nextId, difficulty), 30); return; }
        setMode('ui');
        if (action === 'garage') { setStack([{ name: 'home', params: {} }, { name: 'tracks', params: { region: meta.region, track: id } }]); setRoute({ name: 'garage', params: {} }); }
        else {
          const show = save.tracks[id]?.done && nextId && TRACK_META.find((t) => t.id === nextId);
          const target = show && show.region !== meta.region ? show : meta;
          setStack([{ name: 'home', params: {} }, { name: 'regions', params: {} }]);
          setRoute({ name: 'tracks', params: { region: target.region, track: show ? nextId : id } });
        }
      }
    });
  }, [shell, save]);

  useEffect(() => { if (DEBUG) window.__ttDrive = drive; }, [drive]);

  if (mode !== 'ui') return null;
  const p = { go, back, save, shell, params: route.params };
  const key = route.name + (route.params.region || '');
  return (
    <div className="ui" key={key}>
      <ScreenGuard onHome={() => { setStack([]); setRoute({ name: 'home', params: {} }); }}>
      {route.name === 'home' && <Home {...p} onDrive={drive} />}
      {route.name === 'regions' && <Regions {...p} />}
      {route.name === 'tracks' && <Tracks {...p} onDrive={drive} />}
      {route.name === 'garage' && <Garage {...p} onTestDrive={(id) => drive(TRACK_META[0].id, 'casual', id)} />}
      {route.name === 'profile' && <Profile {...p} />}
      {route.name === 'achievements' && <Achievements {...p} />}
      {route.name === 'settings' && <Settings {...p} />}
      </ScreenGuard>
    </div>
  );
}
