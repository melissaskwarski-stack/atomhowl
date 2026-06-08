import Phaser from 'phaser'

// ── Constants ──────────────────────────────────────────────────────────────
const W = 1280, H = 720
const GRAVITY      = 950
const PLAYER_SPEED = 230
const JUMP_VEL     = -540
const DASH_VEL     = 600
const DASH_MS      = 170
const BULLET_SPD   = 680
const FIRE_CD      = 210
const MELEE_CD     = 380
const MELEE_RANGE  = 90
const CONTACT_DMG  = 0.38   // hp per contact frame

// Enemy definitions — textures match public/assets/ filenames (post-processed)
const ENEMY_TYPES = [
  { id: 'zombie', tex: 'enemy_zombie', hp: 3,  spd: 88,  scale: 1.0, label: 'ZOMBIE'  },
  { id: 'archer', tex: 'enemy_archer', hp: 4,  spd: 65,  scale: 1.0, label: 'ARCHER'  },
  { id: 'boss',   tex: 'enemy_boss',   hp: 12, spd: 42,  scale: 1.0, label: 'BOSS'    },
]

export default class TestScene extends Phaser.Scene {
  constructor() { super('TestScene') }

  preload() {
    // ── REAL downloaded sprites from github.com/thefakemacaw/top-down-shooter ──
    // Processed via tools/unify_assets.py (bg removed, graded, scaled)
    this.load.image('player_placeholder', '/assets/player_placeholder.png')
    this.load.image('enemy_zombie',       '/assets/enemy_zombie.png')
    this.load.image('enemy_archer',       '/assets/enemy_archer.png')
    this.load.image('enemy_boss',         '/assets/enemy_boss.png')
    this.load.image('floor_tile',         '/assets/floor_tile.png')
  }

  create() {
    this.physics.world.gravity.y = GRAVITY

    this._enemies    = []
    this._wave       = 0
    this._waveActive = false
    this._died       = false
    this._pState     = {
      hp: 100, maxHp: 100,
      energy: 0, maxEnergy: 100,
      facing: 1,
      jumpsLeft: 2,
      dashing: false,
      invincible: 0,
      fireCd: 0,
      meleeCd: 0,
      superActive: false,
    }

    this._buildBg()
    this._buildPlatforms()
    this._buildPlayer()
    this._buildGroups()
    this._buildColliders()
    this._buildInput()
    this._buildHUD()

    this._waveLbl = this.add.text(W / 2, 22, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffcc44', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(30)

    const hint = this.add.text(W / 2, H - 28,
      'A/D move  |  W/Space jump (x2)  |  Shift dash  |  Z melee  |  X shoot  |  E SUPER',
      { fontFamily: 'monospace', fontSize: '12px', color: '#555555' }
    ).setOrigin(0.5).setDepth(30)
    this.time.delayedCall(6000, () =>
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, onComplete: () => hint.destroy() })
    )

    this.time.delayedCall(2000, () => this._startWave())
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBg() {
    // Dark gradient sky
    const sky = this.add.graphics()
    for (let y = 0; y < H - 80; y += 3) {
      const t = y / (H - 80)
      sky.fillStyle(Phaser.Display.Color.GetColor(
        Math.floor(Phaser.Math.Linear(10, 34, t)),
        Math.floor(Phaser.Math.Linear(5,  18, t)),
        Math.floor(Phaser.Math.Linear(22, 48, t))
      ))
      sky.fillRect(0, y, W, 4)
    }

    // Moon
    const moon = this.add.graphics()
    moon.fillStyle(0xddddaa, 0.85)
    moon.fillCircle(1140, 75, 38)
    moon.fillStyle(0x14141e, 0.7)
    moon.fillCircle(1155, 67, 32)

    // Ruined city silhouette
    const city = this.add.graphics().setDepth(0)
    city.fillStyle(0x0c0c18)
    const bldgs = [
      [0,225,72],[62,242,55],[112,172,92],[198,205,46],[240,140,86],
      [322,178,62],[386,108,112],[495,185,52],[542,140,106],[646,165,75],
      [718,120,122],[836,152,65],[898,130,95],[990,162,72],[1055,110,112],
      [1162,140,86],[1238,118,52],
    ]
    bldgs.forEach(([x, y, bw]) => city.fillRect(x, y, bw, H - y))

    // Faint broken windows
    city.fillStyle(0x2a1800, 0.45)
    bldgs.forEach(([x, y, bw]) => {
      for (let wy = y + 12; wy < y + 90; wy += 15)
        for (let wx = x + 5; wx < x + bw - 5; wx += 11)
          if (Math.random() < 0.22) city.fillRect(wx, wy, 5, 7)
    })
  }

  // ── Platforms ─────────────────────────────────────────────────────────────

  _buildPlatforms() {
    this._platforms = this.physics.add.staticGroup()

    // Ground visual — real floor_tile tiled across the bottom
    this.add.tileSprite(W / 2, H - 30, W, 60, 'floor_tile')
      .setTileScale(0.17)   // 352px tile → ~60px repeat height
      .setDepth(2)

    // Ground physics body
    const ground = this.physics.add.staticImage(W / 2, H - 30, '__DEFAULT').setVisible(false)
    ground.setDisplaySize(W, 60)
    ground.refreshBody()
    this._platforms.add(ground)

    // Floating platforms — floor_tile strips with a dark tint
    const platDefs = [
      [280,  H - 195, 180, 18],
      [640,  H - 290, 210, 18],
      [1010, H - 175, 165, 18],
      [480,  H - 380, 155, 18],
      [830,  H - 430, 140, 18],
    ]
    platDefs.forEach(([cx, cy, pw, ph]) => {
      this.add.tileSprite(cx, cy, pw, ph, 'floor_tile')
        .setTileScale(0.17)
        .setTint(0x886644)
        .setDepth(2)

      const body = this.physics.add.staticImage(cx, cy, '__DEFAULT').setVisible(false)
      body.setDisplaySize(pw, ph)
      body.refreshBody()
      this._platforms.add(body)
    })
  }

  // ── Player ────────────────────────────────────────────────────────────────

  _buildPlayer() {
    // Real sprite: manBlue_gun.png from github.com/thefakemacaw/top-down-shooter
    // Processed: 103x90 px, white bg removed, color-graded
    this._p = this.physics.add.image(W / 2, H - 200, 'player_placeholder')
    this._p.setCollideWorldBounds(true)
    this._p.setDepth(10)
    // Body slightly tighter than the 103x90 image
    this._p.setBodySize(72, 78, true)
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  _buildGroups() {
    this._bulletGrp = this.physics.add.group()
    this._enemyGrp  = this.physics.add.group()
  }

  // ── Colliders ─────────────────────────────────────────────────────────────

  _buildColliders() {
    this.physics.add.collider(this._p, this._platforms, () => {
      this._pState.jumpsLeft = 2
    })
    this.physics.add.collider(this._enemyGrp, this._platforms)
    this.physics.add.overlap(this._bulletGrp, this._enemyGrp, this._onBulletHit, null, this)
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  _buildInput() {
    this._keys = this.input.keyboard.addKeys({
      left:  'A', right: 'D',
      left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    })
    this.input.keyboard.on('keydown-W',     () => this._jump())
    this.input.keyboard.on('keydown-UP',    () => this._jump())
    this.input.keyboard.on('keydown-SPACE', () => this._jump())
    this.input.keyboard.on('keydown-SHIFT', () => this._dash())
    this.input.keyboard.on('keydown-Z',     () => this._melee())
    this.input.keyboard.on('keydown-X',     () => this._shoot())
    this.input.keyboard.on('keydown-E',     () => this._special())
    this.input.keyboard.on('keydown-R',     () => { if (this._died) this.scene.restart() })

    this.input.on('pointerdown', p => {
      if (p.leftButtonDown())  this._melee()
      if (p.rightButtonDown()) this._shoot()
    })

    this.input.gamepad?.on('down', (pad, btn) => {
      if (btn.index === 0) this._jump()
      if (btn.index === 2) this._melee()
      if (btn.index === 1) this._shoot()
      if (btn.index === 3) this._special()
      if (btn.index === 10) this._dash()
    })
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _buildHUD() {
    const D = 30
    this.add.rectangle(116, 42, 220, 62, 0x000000, 0.6).setOrigin(0.5).setDepth(D - 1)

    this.add.text(12, 14, 'HP', { fontFamily: 'monospace', fontSize: '10px', color: '#aaffaa', fontStyle: 'bold' }).setDepth(D + 1)
    this.add.rectangle(12, 26, 200, 14, 0x220000).setOrigin(0).setDepth(D)
    this._hpBar = this.add.rectangle(12, 26, 200, 14, 0x22cc44).setOrigin(0).setDepth(D + 1)

    this.add.text(12, 44, 'PWR', { fontFamily: 'monospace', fontSize: '10px', color: '#bb88ff', fontStyle: 'bold' }).setDepth(D + 1)
    this.add.rectangle(12, 56, 200, 10, 0x110022).setOrigin(0).setDepth(D)
    this._enBar = this.add.rectangle(12, 56, 0, 10, 0xaa44ff).setOrigin(0).setDepth(D + 1)

    this._specLbl = this.add.text(12, 70, '[ E ]  SUPER MODE READY', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffdd00', fontStyle: 'bold'
    }).setDepth(D + 1).setVisible(false)

    this._counterTxt = this.add.text(W - 14, 14, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff8844', fontStyle: 'bold', align: 'right'
    }).setOrigin(1, 0).setDepth(D)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  _jump() {
    if (this._died) return
    const s = this._pState
    if (s.jumpsLeft <= 0) return
    s.jumpsLeft--
    this._p.setVelocityY(JUMP_VEL)
    if (s.jumpsLeft === 0) {
      // Double-jump puff
      const puff = this.add.circle(this._p.x, this._p.y + 28, 15, 0xffffff, 0.55).setDepth(11)
      this.tweens.add({ targets: puff, scaleX: 3.5, scaleY: 0.15, alpha: 0, duration: 230, onComplete: () => puff.destroy() })
    }
  }

  _dash() {
    if (this._died || this._pState.dashing) return
    const s = this._pState
    s.dashing = true
    s.invincible = Math.max(s.invincible, DASH_MS + 60)
    this._p.setVelocityX(s.facing * DASH_VEL)

    // Ghost afterimages using the real player sprite
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 28, () => {
        if (!this._p?.active) return
        const ghost = this.add.image(this._p.x, this._p.y, 'player_placeholder')
          .setAlpha(0.38).setDepth(9).setFlipX(this._p.flipX)
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() })
      })
    }

    this.time.delayedCall(DASH_MS, () => { s.dashing = false })
  }

  _melee() {
    if (this._died) return
    const s = this._pState
    const now = this.time.now
    if (now - s.meleeCd < MELEE_CD) return
    s.meleeCd = now

    const hx = this._p.x + s.facing * 58
    const hy = this._p.y

    // Slash arc
    const slash = this.add.graphics().setDepth(16)
    slash.lineStyle(3, 0xffee88, 1)
    slash.strokeCircle(hx, hy, 36)
    slash.lineStyle(5, 0xffffff, 0.65)
    const a0 = s.facing === 1 ? -1.1 : Math.PI + 1.1
    const a1 = s.facing === 1 ?  1.1 : Math.PI - 1.1
    slash.beginPath()
    slash.arc(hx, hy, 48, a0, a1, s.facing === -1)
    slash.strokePath()
    this.tweens.add({ targets: slash, alpha: 0, duration: 210, onComplete: () => slash.destroy() })

    this.cameras.main.shake(65, 0.005)

    let hit = 0
    this._enemies.forEach(e => {
      if (e.dying || !e.img.active) return
      const dist = Phaser.Math.Distance.Between(hx, hy, e.img.x, e.img.y)
      if (dist < MELEE_RANGE) { this._damageEnemy(e, 2); hit++ }
    })
    this._gainEnergy(hit > 0 ? 10 : 4)
  }

  _shoot() {
    if (this._died) return
    const s = this._pState
    const now = this.time.now
    if (now - s.fireCd < FIRE_CD) return
    s.fireCd = now

    const bx = this._p.x + s.facing * 36
    const by = this._p.y - 6

    const dot = this.add.circle(bx, by, 5, 0xffee44).setDepth(14)
    this.physics.add.existing(dot)
    dot.body.setVelocity(s.facing * BULLET_SPD, 0)
    dot.body.setAllowGravity(false)
    this._bulletGrp.add(dot)

    // Muzzle flash
    const fl = this.add.circle(bx, by, 12, 0xffffaa, 0.9).setDepth(15)
    this.tweens.add({ targets: fl, alpha: 0, scale: 2.2, duration: 70, onComplete: () => fl.destroy() })

    // Brief tint flash on player to indicate shoot
    this._p.setTint(0xffffcc)
    this.time.delayedCall(80, () => { if (!s.superActive) this._p.clearTint() })

    this.time.delayedCall(1800, () => { if (dot?.active) dot.destroy() })
    this._gainEnergy(3)
  }

  _special() {
    if (this._died) return
    const s = this._pState
    if (s.energy < s.maxEnergy) return

    s.energy = 0
    s.superActive = true
    s.invincible = 3200

    this.cameras.main.flash(250, 255, 200, 40)
    this.cameras.main.shake(300, 0.018)

    // Shockwave ring
    const ring = this.add.graphics().setDepth(20)
    ring.lineStyle(6, 0xffdd00, 1)
    ring.strokeCircle(this._p.x, this._p.y, 10)
    this.tweens.add({ targets: ring, scaleX: 36, scaleY: 36, alpha: 0, duration: 580, onComplete: () => ring.destroy() })

    // Gold tint on the real player sprite
    this._p.setTint(0xffee00)

    // Aura circle
    const aura = this.add.circle(this._p.x, this._p.y, 55, 0xffaa00, 0).setDepth(9)
    this.tweens.add({ targets: aura, alpha: 0.38, yoyo: true, repeat: 5, duration: 280, onComplete: () => aura.destroy() })

    const lbl = this.add.text(this._p.x, this._p.y - 85, '  SUPER MODE  ', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffdd00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(25)
    this.tweens.add({ targets: lbl, y: lbl.y - 65, alpha: 0, duration: 1500, onComplete: () => lbl.destroy() })

    // Kill nearby enemies
    this._enemies.slice().forEach(e => {
      if (e.dying) return
      const dist = Phaser.Math.Distance.Between(this._p.x, this._p.y, e.img.x, e.img.y)
      if (dist < 380) this._killEnemy(e)
    })

    this.time.delayedCall(3200, () => { s.superActive = false; s.invincible = 0; this._p.clearTint() })
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  _startWave() {
    if (this._died) return
    this._wave++
    const count    = Math.min(6 + this._wave * 5, 36)
    const spdMult  = 1 + (this._wave - 1) * 0.14

    this._waveActive = true
    this._waveLbl.setText(`  WAVE ${this._wave}  `)
    this.time.delayedCall(1200, () => {
      if (!this._died) this._waveLbl.setText(`WAVE ${this._wave}   ${count} ENEMIES INCOMING`)
    })
    this.time.delayedCall(2800, () => {
      if (!this._died) this._waveLbl.setText(`WAVE ${this._wave}`)
    })

    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 240, () => {
        if (!this._died) this._spawnEnemy(spdMult)
      })
    }
  }

  _spawnEnemy(spdMult) {
    const fromLeft = Math.random() < 0.5
    const ex = fromLeft ? -60 : W + 60
    const ey = H - 130

    // Weight: 50% zombie, 30% archer, 20% boss
    const roll = Math.random()
    const type = roll < 0.5 ? ENEMY_TYPES[0]
               : roll < 0.8 ? ENEMY_TYPES[1]
                             : ENEMY_TYPES[2]

    // Real sprite image — physics body included
    const img = this.physics.add.image(ex, ey, type.tex)
    img.setScale(type.scale)
    img.setCollideWorldBounds(true)
    img.setDepth(8)
    img.setFlipX(!fromLeft)   // face toward center on spawn
    this._enemyGrp.add(img)

    const maxHp = type.hp * (1 + (this._wave - 1) * 0.18)
    const e = {
      img, type,
      hp: maxHp, maxHp,
      spd: type.spd * spdMult,
      dying: false,
    }
    img.setData('eref', e)
    this._enemies.push(e)
  }

  // ── Damage & Death ────────────────────────────────────────────────────────

  _damageEnemy(e, dmg) {
    e.hp -= dmg
    this._gainEnergy(4)
    if (e.hp <= 0) {
      this._killEnemy(e)
    } else {
      // Hit flash on the real sprite
      this.tweens.add({ targets: e.img, alpha: 0.15, duration: 55, yoyo: true, repeat: 1,
        onComplete: () => { if (e.img.active) e.img.setAlpha(1) } })
    }
  }

  _killEnemy(e) {
    if (e.dying) return
    e.dying = true

    this.cameras.main.shake(95, 0.007)

    // Particle pop
    const numParts = e.type.id === 'boss' ? 10 : 6
    for (let i = 0; i < numParts; i++) {
      const angle = (i / numParts) * Math.PI * 2
      const spd   = Phaser.Math.Between(32, 68)
      const part  = this.add.circle(
        e.img.x + Math.cos(angle) * 8,
        e.img.y + Math.sin(angle) * 8,
        Phaser.Math.Between(3, 7), 0xff6622
      ).setDepth(17)
      this.tweens.add({
        targets: part,
        x: part.x + Math.cos(angle) * spd,
        y: part.y + Math.sin(angle) * spd - 18,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(260, 420),
        onComplete: () => part.destroy()
      })
    }

    // Scale-pop and destroy the real sprite
    this.tweens.add({
      targets: e.img, scaleX: e.img.scaleX * 1.8, scaleY: e.img.scaleY * 1.8,
      alpha: 0, duration: 240,
      onComplete: () => { if (e.img.active) e.img.destroy() }
    })

    this._enemies = this._enemies.filter(x => x !== e)
    this._checkWaveDone()
  }

  _onBulletHit(bullet, enemyImg) {
    if (!bullet.active || !enemyImg.active) return
    bullet.destroy()
    const e = enemyImg.getData('eref')
    if (e && !e.dying) this._damageEnemy(e, 1)
  }

  _checkWaveDone() {
    if (!this._waveActive || this._died) return
    if (this._enemies.filter(e => !e.dying).length === 0) {
      this._waveActive = false
      this._waveLbl.setText('  WAVE CLEAR  ')
      this.time.delayedCall(2200, () => {
        if (!this._died) { this._waveLbl.setText(''); this._startWave() }
      })
    }
  }

  _gainEnergy(amt) {
    this._pState.energy = Math.min(this._pState.energy + amt, this._pState.maxEnergy)
  }

  _diePlayer() {
    if (this._died) return
    this._died = true
    this._p.setVelocity(0, 0)
    this._p.setTint(0x880000)

    this.cameras.main.shake(700, 0.022)

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(50)
    this.tweens.add({ targets: overlay, alpha: 0.85, duration: 1800 })

    this.time.delayedCall(900, () => {
      this.add.text(W / 2, H / 2 - 50, 'YOU DIED', {
        fontFamily: 'monospace', fontSize: '80px', color: '#bb0000', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 6
      }).setOrigin(0.5).setDepth(55)

      this.add.text(W / 2, H / 2 + 46, 'press  R  to try again', {
        fontFamily: 'monospace', fontSize: '22px', color: '#777777'
      }).setOrigin(0.5).setDepth(55)
    })
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this._died) return
    this._movePlayer(delta)
    this._moveEnemies(delta)
    this._updateHUD()
    this._regenHp(delta)
  }

  _movePlayer(delta) {
    const s = this._pState
    const k = this._keys
    if (s.dashing) return

    let dx = 0
    if (k.left.isDown  || k.left2.isDown)  dx = -1
    if (k.right.isDown || k.right2.isDown) dx =  1

    const pad = this.input.gamepad?.gamepads?.[0]
    if (pad && Math.abs(pad.leftStick.x) > 0.15) dx = pad.leftStick.x > 0 ? 1 : -1

    if (dx !== 0) s.facing = dx
    this._p.setVelocityX(dx * PLAYER_SPEED)
    this._p.setFlipX(s.facing === -1)

    if (s.invincible > 0) s.invincible -= delta

    // Flicker while invincible (but not super)
    if (!s.superActive && s.invincible > 0)
      this._p.setAlpha(Math.floor(s.invincible / 80) % 2 === 0 ? 0.35 : 1)
    else if (!s.superActive)
      this._p.setAlpha(1)
  }

  _moveEnemies(delta) {
    this._enemies.forEach(e => {
      if (e.dying || !e.img.active) return

      const dx = this._p.x - e.img.x
      e.img.setVelocityX((dx > 0 ? 1 : -1) * e.spd)
      e.img.setFlipX(dx < 0)   // face toward player using the real sprite

      // Contact damage
      const dist = Phaser.Math.Distance.Between(e.img.x, e.img.y, this._p.x, this._p.y)
      if (dist < 50 && this._pState.invincible <= 0) {
        this._pState.hp -= CONTACT_DMG
        this._pState.invincible = 360

        if (!this._pState.superActive) this._p.setTint(0xff3333)
        this.time.delayedCall(200, () => { if (!this._pState.superActive) this._p.clearTint() })
        this.cameras.main.shake(55, 0.004)

        if (this._pState.hp <= 0) { this._pState.hp = 0; this._diePlayer() }
      }
    })
  }

  _regenHp(delta) {
    const s = this._pState
    if (s.invincible > 0 || s.hp >= s.maxHp) return
    s.hp = Math.min(s.hp + 0.007 * (delta / 16.67), s.maxHp)
  }

  _updateHUD() {
    const s = this._pState

    const hpPct = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1)
    this._hpBar.setDisplaySize(200 * hpPct, 14)
    this._hpBar.setFillStyle(hpPct > 0.5 ? 0x22cc44 : hpPct > 0.25 ? 0xffaa00 : 0xee2222)

    const ePct = Phaser.Math.Clamp(s.energy / s.maxEnergy, 0, 1)
    this._enBar.setDisplaySize(200 * ePct, 10)
    this._specLbl.setVisible(s.energy >= s.maxEnergy && !s.superActive)

    const alive = this._enemies.filter(e => !e.dying).length
    this._counterTxt.setText(`WAVE ${this._wave}   ENEMIES: ${alive}`)
  }
}
