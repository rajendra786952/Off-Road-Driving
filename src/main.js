import Phaser from 'phaser';
import './style.css';

import { GAME_W, GAME_H, GRAVITY_Y } from './game/config/constants.js';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import LevelSelectScene from './game/scenes/LevelSelectScene.js';
import GarageScene from './game/scenes/GarageScene.js';
import SettingsScene from './game/scenes/SettingsScene.js';
import LevelScene from './game/scenes/LevelScene.js';
import ExpeditionScene from './game/scenes/ExpeditionScene.js';
import { initPlatform } from './game/systems/platform.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#83b7dc',
  banner: false,
  disableContextMenu: true,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H
  },

  render: { antialias: true, powerPreference: 'high-performance' },

  // gas + brake + a spare finger
  input: { activePointers: 3 },

  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },
      // LevelScene steps the engine itself at a fixed 60 Hz.
      autoUpdate: false,
      // Sleeping would freeze an idle car and ignore motor input - keep it off.
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 8,
      debug: false
    }
  },

  scene: [BootScene, MenuScene, LevelSelectScene, GarageScene, SettingsScene, LevelScene, ExpeditionScene]
};

const game = new Phaser.Game(config);
initPlatform(game);

// Handy in the browser console while tuning: window.__game
window.__game = game;
