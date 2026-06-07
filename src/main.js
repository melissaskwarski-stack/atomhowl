import Phaser from 'phaser'
import TestScene from './scenes/TestScene.js'
import MenuScene from './scenes/MenuScene.js'
import CharacterSelectScene from './scenes/CharacterSelectScene.js'
import GameScene from './scenes/GameScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#0a0a14',
  input: {
    gamepad: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 }  // each scene sets its own gravity
    }
  },
  // TestScene first — bypasses menu/character select for mechanics testing
  scene: [TestScene, MenuScene, CharacterSelectScene, GameScene]
}

new Phaser.Game(config)
