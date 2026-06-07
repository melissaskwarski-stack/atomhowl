import Phaser from 'phaser'

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 1280, H = 720
const GRAVITY      = 950
const PLAYER_SPEED = 230
const JUMP_VEL     = -540
const DASH_VEL     = 600
const DASH_MS      = 170
const BULLET_SPD   = 680
const FIRE_CD      = 210   // ms between shots
const MELEE_CD     = 380   // ms between swings
const MELEE_RANGE  = 85    // px radius in front
const ENEMY_CONTACT_DMG = 0.4  // hp/frame at 60fps — tunable

// Sprite sheet constants (matches existing assets)
const FW = 256, FH = 512          // main sheet frame size
const S_SCALE = 110 / FH          // ≈ 0.215 — display height ~110 px

const ENEMY_TYPES = [
  { id: 'drone',   hp: 2,  spd: 100, color: 0x4488ff, w: 32, h: 48, label: 'DRONE'   },
  { id: 'crawler', hp: 4,  spd: 72,  color: 0x44cc66, w: 36, h: 36, label: 'CRAWLER' },
  { id: 'brute',   hp: 10, spd: 48,  color: 0xcc3333, w: 52, h: 68, label: 'BRUTE'   },
]

// ── Scene ─────────────────────────────────────────────────────────────────────
export default class TestScene extends Phaser.Scene {
  constructor() { super('TestScene') }

  preload() {
    this.load.spritesheet('eter_sheet', '/assets/eterwolf_sheet.png', { frameWidth: FW, frameHeight: FH })
    this.load.spritesheet('eter_idle',  '/assets/eterwolf_idle.png',  { frameWidth: 512, frameHeight: 1024 })
  }

  create() {
    this.physics.world.gravity.y = GRAVITY

    this._enemies   = []
    this._wave      = 0
    this._waveActive = false
    this._died      = false
    this._pState    = {
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
    this._buildAnims()
    this._buildPlayer()
    this._buildGroups()
    this._buildColliders()
    this._buildInput()
    this._buildHUD()

    // Wave label
    this._waveLbl = this.add.text(W / 2, 22, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffcc44', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(30)

    // Controls hint (fades after 5 s)
    const hint = this.add.text(W / 2, H - 28,
      'A/D move  |  W/Space jump (×2)  |  Shift dash  |  Z melee  |  X shoot  |  E SPECIAL',
      { fontFamily: 'monospace', fontSize: '12px', color: '#666666' }
    ).setOrigin(0.5).setDepth(30)
    this.time.delayedCall(5000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 1000, onComplete: () => hint.destroy() }))

    this.time.delayedCall(2500, () => this._startWave())
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBg() {
    // Sky gradient (dark post-apocalyptic)
    const sky = this.add.graphics()
    for (let y = 0; y < H - 80; y += 3) {
      const t = y / (H - 80)
      sky.fillStyle(Phaser.Display.Color.GetColor(
        Math.floor(Phaser.Math.Linear(12, 38, t)),
        Math.floor(Phaser.Math.Linear(6,  22, t)),
        Math.floor(Phaser.Math.Linear(28, 55, t))
      ))
      sky.fillRect(0, y, W, 4)
    }

    // Moon
    const moon = this.add.graphics()
    moon.fillStyle(0xddddaa, 0.9)
    moon.fillCircle(1150, 80, 40)
    moon.fillStyle(0x181825, 0.6)
    moon.fillCircle(1165, 72, 34)

    // Distant ruined city silhouette
    const city = this.add.graphics()
    city.fillStyle(0x0d0d1a)
    const bldgs = [
      [0,220,75],[65,240,58],[115,180,95],[205,210,48],[248,148,88],
      [330,185,65],[390,118,115],[500,190,55],[548,148,108],[650,172,78],
      [722,128,125],[840,158,68],[902,138,98],[995,168,75],[1060,118,115],
      [1168,148,88],[1240,130,55],
    ]
    bldgs.forEach(([x, y, w]) => city.fillRect(x, y, w, H))

    // Broken windows (faint lit rectangles)
    city.fillStyle(0x332200, 0.5)
    bldgs.forEach(([x, y, w]) => {
      for (let wy = y + 10; wy < y + 80; wy += 14)
        for (let wx = x + 4; wx < x + w - 4; wx += 10)
          if (Math.random() < 0.25) city.fillRect(wx, wy, 5, 7)
    })

    // Ground fill (behind platform graphics)
    this.add.rectangle(W / 2, H - 20, W, 40, 0x1a0f08)
  }

  // ── Platforms ─────────────────────────────────────────────────────────────

  _buildPlatforms() {
    this._platforms = this.physics.add.staticGroup()

    const mkPlat = (cx, cy, pw, ph) => {
      const g = this.add.graphics()
      g.fillStyle(0x3d2b1f)
      g.fillRect(cx - pw / 2, cy - ph / 2, pw, ph)
      g.fillStyle(0x5a3e2e)
      g.fillRect(cx - pw / 2, cy - ph / 2, pw, ph * 0.3)
      g.fillStyle(0x7a5a3e)
      g.fillRect(cx - pw / 2, cy - ph / 2, pw, 4)

      const body = this.physics.add.staticImage(cx, cy, '__DEFAULT').setVisible(false)
      body.setDisplaySize(pw, ph)
      body.refreshBody()
      this._platforms.add(body)
    }

    // Ground
    mkPlat(W / 2, H - 30, W, 60)

    // Floating platforms
    mkPlat(280,  H - 195, 180, 18)
    mkPlat(640,  H - 290, 210, 18)
    mkPlat(1010, H - 175, 165, 18)
    mkPlat(480,  H - 380, 155, 18)
    mkPlat(830,  H - 430, 140, 18)
  }

  // ── Animations ────────────────────────────────────────────────────────────

  _buildAnims() {
    const mk = (key, tex, s, e, rate, repeat = -1) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start: s, end: e }), frameRate: rate, repeat })
    }
    mk('ts_idle',  'eter_idle',  0, 2, 6)
    mk('ts_walk',  'eter_sheet', 2, 5, 10)
    mk('ts_shoot', 'eter_sheet', 6, 7, 14, 0)
    mk('ts_hurt',  'eter_sheet', 8, 8,  6, 0)
    mk('ts_down',  'eter_sheet', 9, 9,  4, 0)
  }

  // ── Player ────────────────────────────────────────────────────────────────

  _buildPlayer() {
    this._p = this.physics.add.sprite(W / 2, H - 200, 'eter_sheet', 2)
    this._p.setScale(S_SCALE)
    this._p.setCollideWorldBounds(true)
    this._p.setDepth(10)
    // body is automatically sized to frame * scale ≈ 55 × 110 px
    this._p.play('ts_walk')
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  _buildGroups() {
    this._bulletGrp = this.physics.add.group()
    this._enemyGrp  = this.physics.add.group()
  }

  // ── Colliders ─────────────────────────────────────────────────────────────

  _buildColliders() {
    // Player lands on platforms → reset double-jump
    this.physics.add.collider(this._p, this._platforms, () => {
      this._pState.jumpsLeft = 2
    })

    // Enemies walk on platforms
    this.physics.add.collider(this._enemyGrp, this._platforms)

    // Bullets hit enemies
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

    // Mouse: left = melee, right = shoot
    this.input.on('pointerdown', p => {
      if (p.leftButtonDown())  this._melee()
      if (p.rightButtonDown()) this._shoot()
    })

    // Gamepad support
    this.input.gamepad?.on('down', (pad, btn) => {
      if (btn.index === 0) this._jump()   // A / Cross
      if (btn.index === 2) this._melee()  // X / Square
      if (btn.index === 1) this._shoot()  // B / Circle
      if (btn.index === 3) this._special() // Y / Triangle
      if (btn.index === 10) this._dash()  // L3
    })
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _buildHUD() {
    const D = 30

    // Panel bg
    this.add.rectangle(116, 42, 220, 60, 0x000000, 0.55).setOrigin(0.5).setDepth(D - 1)

    // HP bar
    this.add.text(12, 14, 'HP', { fontFamily: 'monospace', fontSize: '10px', color: '#aaffaa', fontStyle: 'bold' }).setDepth(D + 1).setOrigin(0)
    this.add.rectangle(12, 26, 200, 14, 0x220000).setOrigin(0).setDepth(D)
    this._hpBar = this.add.rectangle(12, 26, 200, 14, 0x22cc44).setOrigin(0).setDepth(D + 1)

    // Energy bar
    this.add.text(12, 44, 'PWR', { fontFamily: 'monospace', fontSize: '10px', color: '#bb88ff', fontStyle: 'bold' }).setDepth(D + 1).setOrigin(0)
    this.add.rectangle(12, 56, 200, 10, 0x110022).setOrigin(0).setDepth(D)
    this._enBar = this.add.rectangle(12, 56, 0, 10, 0xaa44ff).setOrigin(0).setDepth(D + 1)

    // Special ready label
    this._specLbl = this.add.text(12, 70, '[ E ]  SUPER MODE READY', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffdd00', fontStyle: 'bold'
    }).setOrigin(0).setDepth(D + 1).setVisible(false)

    // Enemy / wave counter (top right)
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

    // Double-jump puff
    if (s.jumpsLeft === 0) {
      const puff = this.add.circle(this._p.x, this._p.y + 28, 16, 0xffffff, 0.55).setDepth(11)
      this.tweens.add({ targets: puff, scaleX: 3.5, scaleY: 0.15, alpha: 0, duration: 240, onComplete: () => puff.destroy() })
    }
  }

  _dash() {
    if (this._died || this._pState.dashing) return
    const s = this._pState
    s.dashing = true
    s.invincible = Math.max(s.invincible, DASH_MS + 60)

    this._p.setVelocityX(s.facing * DASH_VEL)

    // Ghost afterimages
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 30, () => {
        if (!this._p.active) return
        const g = this.add.sprite(this._p.x, this._p.y, this._p.texture.key, this._p.frame.name)
          .setScale(S_SCALE).setAlpha(0.4).setDepth(9).setFlipX(this._p.flipX)
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() })
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

    const hx = this._p.x + s.facing * 55
    const hy = this._p.y

    // Slash arc graphic
    const slash = this.add.graphics().setDepth(16)
    slash.lineStyle(3, 0xffee88, 1)
    slash.strokeCircle(hx, hy, 38)
    slash.lineStyle(5, 0xffffff, 0.7)
    const a0 = s.facing === 1 ? -1.2 : 1.2 + Math.PI
    const a1 = s.facing === 1 ?  1.2 : Math.PI - 1.2
    slash.beginPath()
    slash.arc(hx, hy, 50, a0, a1, s.facing === -1)
    slash.strokePath()
    this.tweens.add({ targets: slash, alpha: 0, duration: 220, onComplete: () => slash.destroy() })

    this.cameras.main.shake(70, 0.005)

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

    const bx = this._p.x + s.facing * 32
    const by = this._p.y - 8

    const dot = this.add.circle(bx, by, 5, 0xffee44).setDepth(14)
    this.physics.add.existing(dot)
    dot.body.setVelocity(s.facing * BULLET_SPD, 0)
    dot.body.setAllowGravity(false)
    this._bulletGrp.add(dot)

    // Muzzle flash
    const fl = this.add.circle(bx, by, 13, 0xffffaa, 0.85).setDepth(15)
    this.tweens.add({ targets: fl, alpha: 0, scale: 2.2, duration: 75, onComplete: () => fl.destroy() })

    // Shoot anim
    this._p.play('ts_shoot')
    this._p.once('animationcomplete', () => { if (!this._died) this._p.play('ts_walk') })

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
    this.cameras.main.shake(320, 0.018)

    // Ring shockwave
    const ring = this.add.graphics().setDepth(20)
    ring.lineStyle(6, 0xffdd00, 1)
    ring.strokeCircle(this._p.x, this._p.y, 10)
    this.tweens.add({
      targets: ring,
      scaleX: 35, scaleY: 35, alpha: 0,
      duration: 600,
      onComplete: () => ring.destroy()
    })

    // Gold aura on player
    this._p.setTint(0xffee00)
    const aura = this.add.circle(this._p.x, this._p.y, 50, 0xffaa00, 0).setDepth(9)
    this.tweens.add({ targets: aura, alpha: 0.35, yoyo: true, repeat: 5, duration: 300, onComplete: () => aura.destroy() })

    // Floating label
    const lbl = this.add.text(this._p.x, this._p.y - 80, '⚡ SUPER MODE ⚡', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffdd00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(25)
    this.tweens.add({ targets: lbl, y: lbl.y - 70, alpha: 0, duration: 1600, onComplete: () => lbl.destroy() })

    // Kill all enemies within radius 380
    this._enemies.slice().forEach(e => {
      if (e.dying) return
      const dist = Phaser.Math.Distance.Between(this._p.x, this._p.y, e.img.x, e.img.y)
      if (dist < 380) this._killEnemy(e)
    })

    this.time.delayedCall(3200, () => {
      s.superActive = false
      s.invincible = 0
      this._p.clearTint()
    })
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  _startWave() {
    if (this._died) return
    this._wave++
    const count = Math.min(6 + this._wave * 5, 35)
    const spdMult = 1 + (this._wave - 1) * 0.14

    this._waveActive = true
    this._waveLbl.setText(`── WAVE ${this._wave} ──`)
    this.time.delayedCall(1300, () => {
      if (!this._died) this._waveLbl.setText(`WAVE ${this._wave}   ${count} ENEMIES INCOMING`)
    })
    this.time.delayedCall(2800, () => {
      if (!this._died) this._waveLbl.setText(`WAVE ${this._wave}`)
    })

    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 260, () => {
        if (!this._died) this._spawnEnemy(spdMult)
      })
    }
  }

  _spawnEnemy(spdMult) {
    const fromLeft = Math.random() < 0.5
    const ex = fromLeft ? -50 : W + 50
    const ey = H - 120

    // Pick weighted type (drones most common, brutes rare)
    const roll = Math.random()
    const type = roll < 0.5 ? ENEMY_TYPES[0] : roll < 0.8 ? ENEMY_TYPES[1] : ENEMY_TYPES[2]

    // Draw the enemy sprite into a render texture
    const rtW = type.w + 20, rtH = type.h + 20
    const gfx = this.make.graphics({ add: false })
    this._drawEnemy(gfx, type)
    const rt = this.add.renderTexture(ex, ey, rtW, rtH).setDepth(8).setOrigin(0.5)
    rt.draw(gfx, 0, 0)
    gfx.destroy()

    // Physics image (invisible body)
    const img = this.physics.add.image(ex, ey, '__DEFAULT').setVisible(false)
    img.setGravityY(0)    // world gravity handles it
    img.setCollideWorldBounds(true)
    img.setBodySize(type.w * 0.8, type.h * 0.9)

    this._enemyGrp.add(img)

    const maxHp = type.hp * (1 + (this._wave - 1) * 0.18)
    const e = {
      rt, img, type,
      hp: maxHp, maxHp,
      spd: type.spd * spdMult,
      dying: false,
      invTimer: 0,
    }
    img.setData('eref', e)
    this._enemies.push(e)
  }

  _drawEnemy(g, type) {
    const c = type.color
    const w = type.w, h = type.h
    const ox = 10, oy = 10   // offset inside the render texture

    if (type.id === 'drone') {
      // Boxy AI robot
      g.fillStyle(c)
      g.fillRect(ox + 4, oy, w - 8, h * 0.65)                          // torso
      g.fillStyle(0x002244)
      g.fillRect(ox + 7, oy + 5, w - 14, h * 0.28)                     // visor
      g.fillStyle(0x88ddff, 0.9)
      g.fillRect(ox + 9, oy + 7, (w - 14) * 0.7, h * 0.16)            // visor glow
      g.fillStyle(c)
      g.fillRect(ox + w * 0.3, oy - 8, 4, 8)                          // antenna
      g.fillRect(ox, oy + h * 0.2, 5, h * 0.3)                        // arm L
      g.fillRect(ox + w - 5, oy + h * 0.2, 5, h * 0.3)               // arm R
      g.fillRect(ox + 6, oy + h * 0.65, 7, h * 0.35)                  // leg L
      g.fillRect(ox + w - 13, oy + h * 0.65, 7, h * 0.35)             // leg R
      // Red eye dot
      g.fillStyle(0xff2200)
      g.fillCircle(ox + w * 0.5, oy + h * 0.15, 4)
    } else if (type.id === 'crawler') {
      // Mutated creature — organic blob
      g.fillStyle(c)
      g.fillCircle(ox + w / 2, oy + h * 0.45, w * 0.52)              // body
      g.fillStyle(0xccffcc)
      g.fillCircle(ox + w * 0.32, oy + h * 0.35, w * 0.15)           // eye L
      g.fillCircle(ox + w * 0.68, oy + h * 0.35, w * 0.15)           // eye R
      g.fillStyle(0x000000)
      g.fillCircle(ox + w * 0.32, oy + h * 0.35, w * 0.07)
      g.fillCircle(ox + w * 0.68, oy + h * 0.35, w * 0.07)
      // Tentacle legs
      g.fillStyle(c)
      for (let i = 0; i < 4; i++) {
        const lx = ox + 3 + i * (w - 6) / 3
        g.fillRect(lx, oy + h * 0.72, 5, h * 0.28)
      }
      // Spines on back
      g.fillStyle(Phaser.Display.Color.ValueToColor(c).brighten(30).color)
      for (let i = 0; i < 3; i++)
        g.fillTriangle(
          ox + w * 0.25 + i * w * 0.22, oy + h * 0.15,
          ox + w * 0.18 + i * w * 0.22, oy + h * 0.35,
          ox + w * 0.32 + i * w * 0.22, oy + h * 0.35,
        )
    } else {
      // Brute — big chunky humanoid
      g.fillStyle(c)
      g.fillRect(ox + 2, oy + h * 0.3, w - 4, h * 0.7)               // legs/lower
      g.fillRect(ox, oy + h * 0.05, w, h * 0.55)                      // torso
      g.fillStyle(0xffaaaa)
      g.fillRect(ox + w * 0.22, oy + h * 0.08, w * 0.56, h * 0.3)    // face
      g.fillStyle(0x000000)
      g.fillRect(ox + w * 0.28, oy + h * 0.13, w * 0.14, h * 0.1)    // eye L
      g.fillRect(ox + w * 0.58, oy + h * 0.13, w * 0.14, h * 0.1)    // eye R
      g.fillStyle(0xcc0000)
      g.fillRect(ox + w * 0.3, oy + h * 0.27, w * 0.4, h * 0.06)     // mouth
      // Big spiked shoulders
      g.fillStyle(Phaser.Display.Color.ValueToColor(c).darken(20).color)
      g.fillRect(ox - 8, oy + h * 0.05, 10, h * 0.35)                 // arm L
      g.fillRect(ox + w - 2, oy + h * 0.05, 10, h * 0.35)             // arm R
      g.fillStyle(0xffaa00)
      g.fillCircle(ox - 4,    oy + h * 0.04, 7)                        // spike L
      g.fillCircle(ox + w + 4, oy + h * 0.04, 7)                       // spike R
    }
  }

  // ── Damage & Death ────────────────────────────────────────────────────────

  _damageEnemy(e, dmg) {
    e.hp -= dmg
    this._gainEnergy(4)
    if (e.hp <= 0) {
      this._killEnemy(e)
    } else {
      // Hit flash
      this.tweens.add({ targets: e.rt, alpha: 0.1, duration: 55, yoyo: true, repeat: 1 })
    }
  }

  _killEnemy(e) {
    if (e.dying) return
    e.dying = true
    e.img.setActive(false)

    this.cameras.main.shake(100, 0.007)

    // Particle pop
    const numParts = e.type.id === 'brute' ? 10 : 6
    for (let i = 0; i < numParts; i++) {
      const angle = (i / numParts) * Math.PI * 2
      const speed = Phaser.Math.Between(35, 75)
      const part = this.add.circle(
        e.img.x + Math.cos(angle) * 8,
        e.img.y + Math.sin(angle) * 8,
        Phaser.Math.Between(3, 7), e.type.color
      ).setDepth(17)
      this.tweens.add({
        targets: part,
        x: part.x + Math.cos(angle) * speed,
        y: part.y + Math.sin(angle) * speed - 15,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(280, 450),
        onComplete: () => part.destroy()
      })
    }

    // Pop tween on the render texture
    this.tweens.add({
      targets: e.rt, scaleX: 2, scaleY: 2, alpha: 0, duration: 260,
      onComplete: () => { if (e.rt.active) e.rt.destroy(); if (e.img.active) e.img.destroy() }
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
      this._waveLbl.setText('✦  WAVE CLEAR  ✦')
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
    this._p.play('ts_down')
    this.cameras.main.shake(700, 0.022)

    // Fade to black
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(50)
    this.tweens.add({ targets: overlay, alpha: 0.85, duration: 1800 })

    this.time.delayedCall(900, () => {
      this.add.text(W / 2, H / 2 - 50, 'YOU DIED', {
        fontFamily: 'monospace', fontSize: '80px', color: '#bb0000', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 6
      }).setOrigin(0.5).setDepth(55)

      this.add.text(W / 2, H / 2 + 45, 'press  R  to try again', {
        fontFamily: 'monospace', fontSize: '22px', color: '#777777'
      }).setOrigin(0.5).setDepth(55)
    })
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this._died) return
    this._movePlayer(delta)
    this._moveEnemies(delta)
    this._syncEnemies()
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

    // Gamepad left stick
    const pad = this.input.gamepad?.gamepads?.[0]
    if (pad && Math.abs(pad.leftStick.x) > 0.15) dx = pad.leftStick.x > 0 ? 1 : -1

    if (dx !== 0) s.facing = dx
    this._p.setVelocityX(dx * PLAYER_SPEED)
    this._p.setFlipX(s.facing === -1)

    const moving = Math.abs(dx) > 0.05
    if (moving && this._p.anims.currentAnim?.key !== 'ts_walk') this._p.play('ts_walk')
    else if (!moving && this._p.body.blocked.down &&
             this._p.anims.currentAnim?.key === 'ts_walk')
      this._p.play('ts_idle')

    if (s.invincible > 0) s.invincible -= delta

    // Flicker while invincible (not super)
    if (!s.superActive && s.invincible > 0)
      this._p.setAlpha(Math.floor(s.invincible / 80) % 2 === 0 ? 0.4 : 1)
    else if (!s.superActive)
      this._p.setAlpha(1)
  }

  _moveEnemies(delta) {
    this._enemies.forEach(e => {
      if (e.dying || !e.img.active) return

      const dx = this._p.x - e.img.x
      e.img.setVelocityX((dx > 0 ? 1 : -1) * e.spd)

      // Flip the render texture to face the player
      e.rt.setFlipX(dx < 0)

      // Contact damage
      const dist = Phaser.Math.Distance.Between(e.img.x, e.img.y, this._p.x, this._p.y)
      if (dist < 46 && this._pState.invincible <= 0) {
        this._pState.hp -= ENEMY_CONTACT_DMG
        this._pState.invincible = 380

        this._p.setTint(0xff3333)
        this.time.delayedCall(200, () => {
          if (!this._pState.superActive) this._p.clearTint()
        })
        this.cameras.main.shake(60, 0.004)

        if (this._pState.hp <= 0) { this._pState.hp = 0; this._diePlayer() }
      }
    })
  }

  _regenHp(delta) {
    const s = this._pState
    if (s.invincible > 0 || s.hp >= s.maxHp) return
    // Slow regen when not being hit
    s.hp = Math.min(s.hp + 0.008 * (delta / 16.67), s.maxHp)
  }

  _syncEnemies() {
    this._enemies.forEach(e => {
      if (e.dying || !e.img.active) return
      e.rt.x = e.img.x
      e.rt.y = e.img.y
    })
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
