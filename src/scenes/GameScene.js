import Phaser from 'phaser'

// ── Sprite sheet layout ───────────────────────────────────────────────────────
// wolffel_sheet / eterwolf_sheet: 1536×1024, 10 cols, 3 rows
const SHEET_W = 1536, SHEET_H = 1024
const S_COLS = 10, S_ROWS = 3
const FW = Math.floor(SHEET_W / S_COLS)   // 153
const FH = Math.floor(SHEET_H / S_ROWS)   // 341

// Row offsets (frame indices into the spritesheet)
const R0 = 0          // top row:   IDLE 0-1, WALK 2-5, RUN 6-9
const R1 = S_COLS     // mid row:   SHOOT 0-1, DASH 2-3, HURT 4
const R2 = S_COLS * 2 // bot row:   DOWN 0, DIR× 1-4, WALKUP 5-8

// wolffel_idle / eterwolf_idle: 1536×1024, 3 frames
const IDLE_FW = Math.floor(1536 / 3)  // 512
const IDLE_FH = 1024

// Render heights (px on screen)
const CHAR_H = 120          // target character screen height
const S_SCALE = CHAR_H / FH          // sheet scale ≈ 0.35
const I_SCALE = CHAR_H / IDLE_FH     // idle scale ≈ 0.12

const BROTHERS = [
  { key: 'wolffel',  name: 'WOLFFEL',  sheet: 'wolffel_sheet',  idle: 'wolffel_idle',  color: '#c8860a', hex: 0xc8860a },
  { key: 'eterwolf', name: 'ETERWOLF', sheet: 'eterwolf_sheet', idle: 'eterwolf_idle', color: '#4a90d9', hex: 0x4a90d9 }
]

const PLAYER_SPEED   = 240
const BULLET_SPEED   = 700
const FIRE_COOLDOWN  = 200   // ms
const ENEMY_BASE_SPD = 85
const ENEMY_HP       = 3

export default class GameScene extends Phaser.Scene {
  constructor() { super('GameScene') }

  init(data) {
    this.playerCount = data.playerCount || 1
    this.selections  = data.selections  || [{ playerIdx: 1, brotherIdx: 0 }]
  }

  preload() {
    BROTHERS.forEach(b => {
      if (!this.textures.exists(b.sheet))
        this.load.spritesheet(b.sheet, `/assets/${b.sheet}.png`, { frameWidth: FW, frameHeight: FH })
      if (!this.textures.exists(b.idle))
        this.load.spritesheet(b.idle,  `/assets/${b.idle}.png`,  { frameWidth: IDLE_FW, frameHeight: IDLE_FH })
    })
  }

  create() {
    const W = this._W = this.scale.width
    const H = this._H = this.scale.height

    this._buildAnims()
    this._buildArena(W, H)

    // Physics groups
    this._bullets   = this.physics.add.group()
    this._enemyBodies = this.physics.add.group()

    // Players
    this._players = []
    this.selections.forEach((sel, i) => {
      const b = BROTHERS[sel.brotherIdx]
      const x = i === 0 ? W * 0.3 : W * 0.7
      this._players.push(this._createPlayer(b, x, H / 2, sel.playerIdx))
    })

    // Input
    this._wasd    = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' })
    this._cursors = this.input.keyboard.createCursorKeys()
    this._shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    this._ctrlKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL)

    // State
    this._aimAngles  = [0, 0]
    this._fireTimers = [0, 0]
    this._mouseDown  = false
    this._enemyList  = []
    this._wave       = 0
    this._waveActive = false

    // Collisions
    this.physics.add.overlap(this._bullets, this._enemyBodies, this._onBulletHit, null, this)

    // HUD
    this._buildHUD(W, H)

    // Wave counter text
    this._waveTxt = this.add.text(W / 2, 36, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px', color: '#ffcc44', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20)

    // Mouse aim + shoot for P1
    this.input.on('pointermove', p => {
      if (this._players[0])
        this._aimAngles[0] = Phaser.Math.Angle.Between(
          this._players[0].body.x, this._players[0].body.y, p.x, p.y)
    })
    this.input.on('pointerdown', () => this._mouseDown = true)
    this.input.on('pointerup',   () => this._mouseDown = false)

    // Start first wave after 3 s
    this.time.delayedCall(3000, () => this._startWave())

    this._buildFilmGrain(W, H)
  }

  // ── Arena ─────────────────────────────────────────────────────────────────

  _buildArena(W, H) {
    const SZ = 64
    const g = this.add.graphics()
    for (let ty = 0; ty < H; ty += SZ) {
      for (let tx = 0; tx < W; tx += SZ) {
        const v = Phaser.Math.Between(16, 28)
        g.fillStyle(Phaser.Display.Color.GetColor(v, v, v + 5))
        g.fillRect(tx + 1, ty + 1, SZ - 2, SZ - 2)
      }
    }
    g.lineStyle(1, 0x05050a, 0.9)
    for (let tx = 0; tx <= W; tx += SZ) g.lineBetween(tx, 0, tx, H)
    for (let ty = 0; ty <= H; ty += SZ) g.lineBetween(0, ty, W, ty)

    // Vignette
    const v = this.add.graphics().setDepth(2)
    const steps = 14
    for (let s = 0; s < steps; s++) {
      const alpha = (s / steps) * 0.9
      const d = s * 32
      v.fillStyle(0x000000, alpha)
      v.fillRect(0, 0, W, d)
      v.fillRect(0, H - d, W, d)
      v.fillRect(0, d, d, H - d * 2)
      v.fillRect(W - d, d, d, H - d * 2)
    }
  }

  _buildFilmGrain(W, H) {
    const rt  = this.add.renderTexture(0, 0, W, H).setDepth(30).setAlpha(0.035)
    const gfx = this.make.graphics({ x: 0, y: 0, add: false })
    const tick = () => {
      gfx.clear()
      for (let i = 0; i < 3500; i++) {
        const b = Phaser.Math.Between(0, 255)
        gfx.fillStyle(Phaser.Display.Color.GetColor(b, b, b), 1)
        gfx.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 1, 1)
      }
      rt.clear(); rt.draw(gfx, 0, 0)
    }
    tick()
    this.time.addEvent({ delay: 80, callback: tick, loop: true })
  }

  // ── Animations ────────────────────────────────────────────────────────────

  _buildAnims() {
    BROTHERS.forEach(b => {
      const mk = (key, start, end, rate, repeat = -1) => {
        if (!this.anims.exists(key))
          this.anims.create({ key, frames: this.anims.generateFrameNumbers(b.sheet, { start, end }), frameRate: rate, repeat })
      }
      const mki = (key, start, end, rate) => {
        if (!this.anims.exists(key))
          this.anims.create({ key, frames: this.anims.generateFrameNumbers(b.idle, { start, end }), frameRate: rate, repeat: -1 })
      }
      mki(`${b.key}_idle`,  0, 2, 6)
      mk(`${b.key}_walk`,   R0 + 2, R0 + 5, 10)
      mk(`${b.key}_run`,    R0 + 6, R0 + 9, 14)
      mk(`${b.key}_shoot`,  R1,     R1 + 1, 14, 0)
      mk(`${b.key}_hurt`,   R1 + 4, R1 + 4,  6, 0)
      mk(`${b.key}_down`,   R2,     R2,      4, 0)
    })
  }

  // ── Player ────────────────────────────────────────────────────────────────

  _createPlayer(def, x, y, playerIdx) {
    // Visible sprite (uses idle sheet by default)
    const spr = this.add.sprite(x, y, def.idle, 0).setDepth(10).setScale(I_SCALE)
    spr.play(`${def.key}_idle`)

    // Invisible physics body
    const body = this.physics.add.image(x, y, '__DEFAULT').setVisible(false)
    body.setCollideWorldBounds(true)
    body.setCircle(20, -20, -20)   // offset so circle centres on image origin

    return { spr, body, def, playerIdx, hp: 100, maxHp: 100, facing: 0, state: 'idle', isDown: false }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _buildHUD(W, H) {
    this._hpBars = []
    this._players.forEach((p, i) => {
      const left = i === 0
      const ex = left ? 16 : W - 16
      const bx = left ? 16 : W - 166

      this.add.text(ex, 12, `P${p.playerIdx}`, {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        color: p.def.color, fontStyle: 'bold'
      }).setOrigin(left ? 0 : 1, 0).setDepth(20)

      this.add.text(ex, 28, p.def.name, {
        fontFamily: '"Courier New", monospace', fontSize: '11px', color: '#aaaaaa'
      }).setOrigin(left ? 0 : 1, 0).setDepth(20)

      const bg  = this.add.rectangle(bx + 75, 52, 150, 12, 0x330000).setDepth(20).setOrigin(0.5)
      const bar = this.add.rectangle(bx + 75, 52, 150, 12, 0x22cc44).setDepth(21).setOrigin(left ? 0 : 1).setX(left ? bx : bx + 150)
      this._hpBars.push({ bar, maxW: 150, left })
    })
  }

  _updateHUD() {
    this._players.forEach((p, i) => {
      const hb = this._hpBars[i]; if (!hb) return
      const pct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1)
      hb.bar.setDisplaySize(hb.maxW * pct, 12)
      hb.bar.setFillStyle(pct > 0.5 ? 0x22cc44 : pct > 0.25 ? 0xffaa00 : 0xee2222)
    })
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  _startWave() {
    this._wave++
    const count = this._wave === 1 ? 8 : 12 + (this._wave - 2) * 4
    const spd   = 1 + (this._wave - 1) * 0.18

    this._waveActive = true
    this._waveTxt.setText(`── WAVE ${this._wave} ──`)
    this.time.delayedCall(1400, () =>
      this._waveTxt.setText(`WAVE ${this._wave}   ${count} enemies`)
    )

    for (let i = 0; i < count; i++)
      this.time.delayedCall(i * 300, () => this._spawnEnemy(spd))
  }

  _spawnEnemy(spdMult) {
    const W = this._W, H = this._H
    const edge = Phaser.Math.Between(0, 3)
    let ex, ey
    if (edge === 0) { ex = Phaser.Math.Between(0, W); ey = -40 }
    else if (edge === 1) { ex = Phaser.Math.Between(0, W); ey = H + 40 }
    else if (edge === 2) { ex = -40; ey = Phaser.Math.Between(0, H) }
    else { ex = W + 40; ey = Phaser.Math.Between(0, H) }

    // Draw enemy sprite into a render texture (shambling human silhouette)
    const gfx = this.make.graphics({ x: 0, y: 0, add: false })
    gfx.fillStyle(0x553322); gfx.fillCircle(20, 10, 10)  // head
    gfx.fillStyle(0x442211); gfx.fillRect(12, 20, 16, 22) // torso
    gfx.fillStyle(0x331a0a)
    gfx.fillRect(10, 42, 7, 16)  // leg L
    gfx.fillRect(23, 42, 7, 16)  // leg R
    gfx.fillRect(5,  22, 7, 14)  // arm L
    gfx.fillRect(28, 22, 7, 14)  // arm R

    const rt = this.add.renderTexture(ex, ey, 40, 60).setDepth(8).setOrigin(0.5)
    rt.draw(gfx, 0, 0)
    gfx.destroy()

    const img = this.physics.add.image(ex, ey, '__DEFAULT').setVisible(false)
    img.setCircle(18, -18, -18)

    const e = { rt, img, hp: ENEMY_HP, spd: ENEMY_BASE_SPD * spdMult, dying: false }
    this._enemyBodies.add(img)
    img.setData('eref', e)
    this._enemyList.push(e)
  }

  // ── Bullets ───────────────────────────────────────────────────────────────

  _fireBullet(player, angle) {
    const ox = Math.cos(angle) * 30
    const oy = Math.sin(angle) * 30
    const bx = player.body.x + ox
    const by = player.body.y + oy

    const dot = this.add.circle(bx, by, 5, 0xffee66).setDepth(15)
    this.physics.add.existing(dot)
    dot.body.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED)
    dot.body.setCircle(5)
    this._bullets.add(dot)

    // Muzzle flash
    const fl = this.add.circle(bx, by, 14, 0xffffaa, 0.85).setDepth(16)
    this.tweens.add({ targets: fl, alpha: 0, scaleX: 2, scaleY: 2, duration: 90, onComplete: () => fl.destroy() })

    this.time.delayedCall(1600, () => { if (dot.active) dot.destroy() })
  }

  _onBulletHit(bullet, enemyImg) {
    if (!bullet.active || !enemyImg.active) return
    bullet.destroy()

    const e = enemyImg.getData('eref')
    if (!e || e.dying) return
    e.hp--
    if (e.hp <= 0) {
      this._killEnemy(e, enemyImg)
    } else {
      // Flash
      this.tweens.add({ targets: e.rt, alpha: 0.1, duration: 50, yoyo: true, repeat: 2 })
    }
  }

  _killEnemy(e, img) {
    e.dying = true
    img.setActive(false).setVisible(false)
    this.tweens.add({
      targets: e.rt, alpha: 0, scaleX: 2, scaleY: 2, duration: 300,
      onComplete: () => { e.rt.destroy(); img.destroy() }
    })
    this._enemyList = this._enemyList.filter(x => x !== e)
    this._checkWaveDone()
  }

  _checkWaveDone() {
    if (!this._waveActive) return
    const alive = this._enemyList.filter(e => !e.dying)
    if (alive.length === 0) {
      this._waveActive = false
      this._waveTxt.setText('✦  WAVE COMPLETE  ✦')
      this.time.delayedCall(2200, () => { this._waveTxt.setText(''); this._startWave() })
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(time) {
    this._movePlayers(time)
    this._moveEnemies()
    this._updateHUD()
  }

  _movePlayers(time) {
    const pads = this.input.gamepad?.gamepads ?? []

    this._players.forEach((p, i) => {
      if (p.isDown) return

      let dx = 0, dy = 0
      const pad = pads[i]

      if (i === 0) {
        if (this._wasd.left.isDown)  dx -= 1
        if (this._wasd.right.isDown) dx += 1
        if (this._wasd.up.isDown)    dy -= 1
        if (this._wasd.down.isDown)  dy += 1
        if (pad) {
          if (Math.abs(pad.leftStick.x) > 0.15) dx += pad.leftStick.x
          if (Math.abs(pad.leftStick.y) > 0.15) dy += pad.leftStick.y
          const rx = pad.rightStick.x, ry = pad.rightStick.y
          if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15)
            this._aimAngles[0] = Math.atan2(ry, rx)
          if ((pad.R2 ?? 0) > 0.3 || pad.buttons[5]?.pressed) this._tryFire(p, 0, time)
        }
        if (this._mouseDown || this._shiftKey.isDown) this._tryFire(p, 0, time)
      } else {
        if (this._cursors.left.isDown)  dx -= 1
        if (this._cursors.right.isDown) dx += 1
        if (this._cursors.up.isDown)    dy -= 1
        if (this._cursors.down.isDown)  dy += 1
        if (pad) {
          if (Math.abs(pad.leftStick.x) > 0.15) dx += pad.leftStick.x
          if (Math.abs(pad.leftStick.y) > 0.15) dy += pad.leftStick.y
          const rx = pad.rightStick.x, ry = pad.rightStick.y
          if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15)
            this._aimAngles[1] = Math.atan2(ry, rx)
          if ((pad.R2 ?? 0) > 0.3 || pad.buttons[5]?.pressed) this._tryFire(p, 1, time)
        }
        if (this._ctrlKey.isDown) this._tryFire(p, 1, time)
        // Auto-aim toward nearest enemy when no gamepad
        if (!pad && this._enemyList.length) {
          const near = this._nearestEnemy(p.body.x, p.body.y)
          if (near) this._aimAngles[1] = Phaser.Math.Angle.Between(p.body.x, p.body.y, near.img.x, near.img.y)
        }
      }

      // Normalize
      const mag = Math.sqrt(dx * dx + dy * dy)
      if (mag > 1) { dx /= mag; dy /= mag }

      p.body.setVelocity(dx * PLAYER_SPEED, dy * PLAYER_SPEED)

      // Sync sprite to body
      p.spr.x = p.body.x
      p.spr.y = p.body.y

      const moving = mag > 0.05
      if (moving) {
        p.facing = Math.atan2(dy, dx)
        p.spr.setRotation(p.facing + Math.PI / 2)
        if (p.state !== 'walk') {
          p.state = 'walk'
          p.spr.setTexture(p.def.sheet).setScale(S_SCALE)
          p.spr.play(`${p.def.key}_walk`)
        }
      } else if (p.state === 'walk') {
        p.state = 'idle'
        p.spr.setTexture(p.def.idle).setScale(I_SCALE)
        p.spr.play(`${p.def.key}_idle`)
        p.spr.setRotation(p.facing + Math.PI / 2)
      }
    })
  }

  _tryFire(player, idx, time) {
    if (time - this._fireTimers[idx] < FIRE_COOLDOWN) return
    this._fireTimers[idx] = time
    this._fireBullet(player, this._aimAngles[idx])

    // Shoot anim briefly on sheet
    if (player.state !== 'walk') {
      player.spr.setTexture(player.def.sheet).setScale(S_SCALE)
      player.spr.play(`${player.def.key}_shoot`)
      player.spr.once('animationcomplete', () => {
        if (player.state !== 'walk') {
          player.spr.setTexture(player.def.idle).setScale(I_SCALE)
          player.spr.play(`${player.def.key}_idle`)
        }
      })
    }
  }

  _nearestEnemy(x, y) {
    return this._enemyList
      .filter(e => !e.dying)
      .reduce((best, e) => {
        const d  = Phaser.Math.Distance.Between(x, y, e.img.x, e.img.y)
        const bd = best ? Phaser.Math.Distance.Between(x, y, best.img.x, best.img.y) : Infinity
        return d < bd ? e : best
      }, null)
  }

  _moveEnemies() {
    this._enemyList.forEach(e => {
      if (e.dying || !e.img.active) return

      const targets = this._players.filter(p => !p.isDown)
      if (!targets.length) return

      const target = targets.reduce((best, p) => {
        const d  = Phaser.Math.Distance.Between(e.img.x, e.img.y, p.body.x, p.body.y)
        const bd = Phaser.Math.Distance.Between(e.img.x, e.img.y, best.body.x, best.body.y)
        return d < bd ? p : best
      })

      const angle = Phaser.Math.Angle.Between(e.img.x, e.img.y, target.body.x, target.body.y)
      e.img.setVelocity(Math.cos(angle) * e.spd, Math.sin(angle) * e.spd)

      // Sync visual
      e.rt.x = e.img.x
      e.rt.y = e.img.y

      // Contact damage to players
      this._players.forEach(p => {
        if (p.isDown) return
        const dist = Phaser.Math.Distance.Between(e.img.x, e.img.y, p.body.x, p.body.y)
        if (dist < 38) {
          p.hp -= 0.28
          if (p.hp <= 0) { p.hp = 0; this._downPlayer(p) }
        }
      })
    })
  }

  _downPlayer(p) {
    if (p.isDown) return
    p.isDown = true
    p.body.setVelocity(0, 0)
    p.spr.setTexture(p.def.sheet).setScale(S_SCALE)
    p.spr.play(`${p.def.key}_down`)
    this.cameras.main.shake(350, 0.01)

    this.add.text(p.body.x, p.body.y - 60, 'DOWN!', {
      fontFamily: '"Courier New", monospace', fontSize: '20px', color: '#ff4444', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(25)
      .setAlpha(1)
  }
}
