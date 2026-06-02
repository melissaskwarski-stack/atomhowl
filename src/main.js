import Phaser from 'phaser'
import MenuScene from './scenes/MenuScene.js'
import CharacterSelectScene from './scenes/CharacterSelectScene.js'
import GameScene from './scenes/GameScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#000000',
  input: {
    gamepad: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 }
    }
  },
  scene: [MenuScene, CharacterSelectScene, GameScene]
}

new Phaser.Game(config)
