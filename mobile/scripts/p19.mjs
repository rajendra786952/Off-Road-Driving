import fs from 'node:fs';
let s = fs.readFileSync('src/screens/GameScreen.tsx', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b); };

rep("import { Bar, Btn, C, Coins, Stars, fmt, s as ks } from '../ui/kit';", "import { Bar, Btn, C, Coins, Stars, fmt, s as ks } from '../ui/kit';\nimport { StuntHud } from './StuntHud';");
rep("        case 'stunt': play('stunt'); toast.current?.show(e.text); break;", `        case 'stunt':
          if (e.grade === 'rough' || e.grade === 'crash') {
            play('smash', 90);
            buzz('heavy');
            toast.current?.show(e.text, e.grade === 'crash' ? '#ff6b5a' : '#ffb04a');
          } else {
            play('stunt');
            if (e.grade === 'perfect') play('checkpoint', 120);
            if ((e.multiplier ?? 1) >= 2) play('win', 400);
            if (e.points) buzz('light');
            toast.current?.show(e.text, e.grade === 'perfect' ? C.gold : C.greenHi);
          }
          break;
        case 'damage': if (e.added > 0) buzz('heavy'); break;
        case 'repair': toast.current?.show('CAR REPAIRED', C.greenHi); break;`);
rep("      <Toast ref={toast} />", "      <StuntHud worldRef={worldRef} />\n      <Toast ref={toast} />");
rep("  crash: { title: 'CRASHED', tip: 'Keep your head off the ground!' },", "  crash: { title: 'CRASHED', tip: 'Line the car up with the ground before you land: gas lifts the nose, brake drops it.' },");
rep("{o.result.stuntBonus > 0 ? <Text style={[st.line, { color: C.greenHi }]}>Stunts and checkpoints: +{fmt(o.result.stuntBonus)} (included)</Text> : null}", `{o.result.stuntScore > 0 ? (
            <Text style={[st.line, { color: C.gold }]}>
              Stunt score {fmt(o.result.stuntScore)} (front flips {o.result.frontFlips}, back flips {o.result.backFlips})
            </Text>
          ) : null}
          {o.result.stuntBonus > 0 ? <Text style={[st.line, { color: C.greenHi }]}>Stunts and checkpoints: +{fmt(o.result.stuntBonus)} (included)</Text> : null}`);
fs.writeFileSync('src/screens/GameScreen.tsx', s);

let sc = fs.readFileSync('src/render/scene.ts', 'utf8');
const old = `      case 'land':
        this.shake = Math.max(this.shake, e.intensity * 7);
        break;`;
if (!sc.includes(old)) throw new Error('scene');
sc = sc.replace(old, old + `
      case 'stunt':
        if (e.points) {
          const p = this.world.vehicle.chassis.position;
          this.emit(p.x, p.y - 20, e.grade === 'perfect' ? 22 : 12, { color: e.grade === 'perfect' ? '#ffd23f' : '#8dff9b', speed: 3.4, life: 650, size: 4, grav: 0.1 });
        }
        break;
      case 'damage':
        if (e.added > 0) this.shake = Math.max(this.shake, 6 + e.added * 0.15);
        break;`);
fs.writeFileSync('src/render/scene.ts', sc);
