// Application shell.
//  - React renders the whole interface (menus, garage, profile, settings).
//  - Three.js renders the 3D expedition in its own overlay canvas (src/drive).
//  - Phaser runs only the classic 2D mode; it is asleep and hidden otherwise,
//    so the two renderers never compete for a WebGL context or a frame loop.
import Phaser from 'phaser';
import './style.css';
import './ui/ui.css';

import { GAME_W, GAME_H, GRAVITY_Y } from './game/config/constants.js';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import LevelSelectScene from './game/scenes/LevelSelectScene.js';
import GarageScene from './game/scenes/GarageScene.js';
import SettingsScene from './game/scenes/SettingsScene.js';
import LevelScene from './game/scenes/LevelScene.js';
import { initPlatform, exitApp } from './game/systems/platform.js';
import { isDriving, driveBack, drivePause } from './drive/launch.js';
import { mountUI } from './ui/mount.jsx';
import { bus } from './ui/store.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b1217',
  banner: false,
  disableContextMenu: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_W, height: GAME_H },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },
      autoUpdate: false,
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 8,
      debug: false
    }
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GarageScene, SettingsScene, LevelScene]
};

const game = new Phaser.Game(config);
initPlatform(game);
window.__game = game;

const container = document.getElementById('game-container');
let classicOpen = false;

const shell = {
  audioCtx: () => (game.sound && game.sound.context ? game.sound.context : null),
  /** Show the classic 2D game (Phaser). */
  openClassic() {
    classicOpen = true;
    container.style.visibility = '';
    game.loop.wake();
    game.scene.start('MenuScene');
    bus.emit('classic', true);
  },
  closeClassic() {
    classicOpen = false;
    game.scene.getScenes(true).forEach((s) => s.scene.stop());
    game.loop.sleep();
    container.style.visibility = 'hidden';
    bus.emit('classic', false);
  },
  exitApp
};
window.__shell = shell;

// BootScene loads the save and textures, then hands over to the React shell.
game.events.once('boot-ready', () => {
  game.loop.sleep();
  container.style.visibility = 'hidden';
  mountUI(document.getElementById('ui-root'), shell);
});
game.events.on('shell-home', () => shell.closeClassic());

// Android hardware back + app backgrounding
game.events.on('android-back', () => {
  if (isDriving()) driveBack();
  else if (!classicOpen) bus.emit('back');
});
game.events.on('app-pause', () => drivePause());
