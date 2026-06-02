import Phaser from 'phaser'

// Sprite sheet: 1536x1024, 3 rows, top row has 10 frames
const SHEET_W = 1536
const SHEET_H = 1024
const SHEET_COLS = 10
const SHEET_ROWS = 3
const FRAME_W = SHEET_W / SHEET_COLS        // 153.6 → use floor
const FRAME_H = Math.floor(SHEET_H / SHEET_ROWS) // 341

// Idle sheets: 1536x1024, 3 frames, 1 row
const IDLE_W = SHEET_W / 3   // 512
const IDLE_H = SHEET_H        // 1024

const BROTHERS = [
  {
    key: 'wolffel',
    name: 'WOLFFEL',
    sheet: 'wolffel_sheet',
    idle: 'wolffel_idle',
    desc: 'The enforcer. Built like a tank, fights like a freight train.\nShorter range, massive stopping power. Eats while shooting.',
    color: 0xc8860a
  },
  {
    key: 'eterwolf',
    name: 'ETERWOLF',
    sheet: 'eterwolf_sheet',
    idle: 'eterwolf_idle',
    desc: 'The wild one. Long hair, longer reach. Shreds guitar,\nshreds enemies. Fast, unpredictable, dangerous.',
    color: 0x4a90d9
  }
]

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene')
  }

  init(data) {
    this.playerCount = data.playerCount || 1
  }

  preload() {
    // Main sprite sheets
    this.load.spritesheet('wolffel_sheet', '/assets/wolffel_sheet.png', {
      frameWidth: Math.floor(FRAME_W),
      frameHeight: FRAME_H
    })
    this.load.spritesheet('eterwolf_sheet', '/assets/eterwolf_sheet.png', {
      frameWidth: Math.floor(FRAME_W),
      frameHeight: FRAME_H
    })
    // Idle sheets
    this.load.spritesheet('wolffel_idle', '/assets/wolffel_idle.png', {
      frameWidth: IDLE_W,
      frameHeight: IDLE_H
    })
    this.load.spritesheet('eterwolf_idle', '/assets/eterwolf_idle.png', {
      frameWidth: IDLE_W,
      frameHeight: IDLE_H
    })
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0f)

    this.add.text(W / 2, 48, 'SELECT YOUR BROTHER', {
      fontFamily: '"Courier New", monospace',
      fontSize: '32px',
      color: '#ffcc44',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    if (this.playerCount === 2) {
      this.add.text(W / 2, 88, 'P1 selects first, then P2', {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#aaaaaa'
      }).setOrigin(0.5)
    }

    this._selections = []  // [{playerIdx, brotherIdx}]
    this._phase = 1        // 1 = P1 picking, 2 = P2 picking

    // Create animations for idle previews
    this._createAnims()

    // Card panels
    this._cards = BROTHERS.map((b, i) => this._makeCard(b, i, W, H))

    // Instruction text
    this._instrText = this.add.text(W / 2, H - 40, 'Click a character to select', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#888888'
    }).setOrigin(0.5)

    this._updateInstructions()
  }

  _createAnims() {
    BROTHERS.forEach(b => {
      if (!this.anims.exists(`${b.key}_idle_preview`)) {
        this.anims.create({
          key: `${b.key}_idle_preview`,
          frames: this.anims.generateFrameNumbers(b.idle, { start: 0, end: 2 }),
          frameRate: 6,
          repeat: -1
        })
      }
    })
  }

  _makeCard(brother, idx, W, H) {
    const x = W * 0.28 + idx * W * 0.44
    const cardH = H * 0.72
    const cardY = H * 0.48

    const bg = this.add.rectangle(x, cardY, W * 0.38, cardH, 0x111122, 0.9)
      .setStrokeStyle(2, 0x444466)

    // Sprite preview — scale down idle frames (512x1024 → fit in ~200px tall)
    const sprScale = 0.22
    const spr = this.add.sprite(x, cardY - 40, brother.idle, 0)
    spr.setScale(sprScale)
    spr.play(`${brother.key}_idle_preview`)

    const nameText = this.add.text(x, cardY + cardH * 0.32, brother.name, {
      fontFamily: '"Courier New", monospace',
      fontSize: '26px',
      color: '#' + brother.color.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const descText = this.add.text(x, cardY + cardH * 0.46, brother.desc, {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#cccccc',
      align: 'center',
      wordWrap: { width: W * 0.34 }
    }).setOrigin(0.5)

    const badge = this.add.text(x, cardY - cardH * 0.44, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#333300',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setVisible(false)

    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => {
      bg.setStrokeStyle(3, brother.color)
    })
    bg.on('pointerout', () => {
      if (!this._isSelected(idx)) bg.setStrokeStyle(2, 0x444466)
    })
    bg.on('pointerdown', () => this._pick(idx))

    return { bg, spr, nameText, descText, badge, brotherIdx: idx }
  }

  _isSelected(idx) {
    return this._selections.some(s => s.brotherIdx === idx)
  }

  _pick(brotherIdx) {
    const playerIdx = this._phase
    const brother = BROTHERS[brotherIdx]

    // Remove any prior pick for this player
    this._selections = this._selections.filter(s => s.playerIdx !== playerIdx)
    this._selections.push({ playerIdx, brotherIdx })

    // Update badge
    const card = this._cards[brotherIdx]
    card.badge.setText(`P${playerIdx}`)
    card.badge.setVisible(true)
    card.bg.setStrokeStyle(3, brother.color)

    if (this.playerCount === 1 || this._phase === 2) {
      // Launch game
      this.time.delayedCall(300, () => {
        this.scene.start('GameScene', {
          playerCount: this.playerCount,
          selections: this._selections
        })
      })
    } else {
      this._phase = 2
      this._updateInstructions()
    }
  }

  _updateInstructions() {
    if (this.playerCount === 1) {
      this._instrText.setText('Click a character to play')
    } else if (this._phase === 1) {
      this._instrText.setText('P1 — Click your character')
    } else {
      this._instrText.setText('P2 — Click your character')
    }
  }
}
