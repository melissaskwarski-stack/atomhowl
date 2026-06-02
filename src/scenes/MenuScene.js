import Phaser from 'phaser'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  preload() {
    this.load.image('menu-bg', '/assets/atomhowl-menu.png')
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height

    // Background stretched to fill
    const bg = this.add.image(W / 2, H / 2, 'menu-bg')
    bg.setDisplaySize(W, H)

    // Darken overlay so buttons pop
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25)

    this._selected = 0

    // Button configs
    const btns = [
      { label: '1 PLAYER', mode: 1 },
      { label: '2 PLAYERS', mode: 2 }
    ]

    this._buttons = btns.map((b, i) => {
      const y = H * 0.52 + i * 80
      const bg = this.add.rectangle(W / 2, y, 340, 54, 0x1a0a00, 0.92).setStrokeStyle(2, 0xc8860a)
      const txt = this.add.text(W / 2, y, b.label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '28px',
        color: '#f0c060',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerover', () => this._setSelected(i))
      bg.on('pointerout', () => {})
      bg.on('pointerdown', () => this._launch(b.mode))
      return { bg, txt, mode: b.mode }
    })

    // Keyboard nav
    this.input.keyboard.on('keydown-DOWN', () => this._setSelected((this._selected + 1) % 2))
    this.input.keyboard.on('keydown-UP', () => this._setSelected((this._selected + 1) % 2))
    this.input.keyboard.on('keydown-ENTER', () => this._launch(this._buttons[this._selected].mode))
    this.input.keyboard.on('keydown-SPACE', () => this._launch(this._buttons[this._selected].mode))

    this._setSelected(0)
  }

  _setSelected(idx) {
    this._selected = idx
    this._buttons.forEach((b, i) => {
      if (i === idx) {
        b.bg.setFillStyle(0x3d1a00, 0.95)
        b.bg.setStrokeStyle(3, 0xffcc00)
        b.txt.setColor('#ffee88')
        b.txt.setScale(1.05)
      } else {
        b.bg.setFillStyle(0x1a0a00, 0.92)
        b.bg.setStrokeStyle(2, 0xc8860a)
        b.txt.setColor('#f0c060')
        b.txt.setScale(1.0)
      }
    })
  }

  _launch(mode) {
    this.scene.start('CharacterSelectScene', { playerCount: mode })
  }
}
