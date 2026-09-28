# ATOMHOWL — working notes

## Cinematics play once per game

Every cinematic (anything that takes the camera or the controls away to show
something: pans/zooms, letterbox bars, held input, stills, a cinematic scene)
plays **once per New Game**. Dying, falling, the R restart, walking back into
a room and CONTINUE must never replay it. Only NEW GAME (`resetProgress()`)
brings it back.

- Gate it with `firstCinematic('name')` in `src_game/ah_game.js`: it returns
  true the one time the cinematic should play, marks it in `GameState.seen`
  and writes it into the saved checkpoint.
- The skip path must still do the gameplay part of the set piece (the enemy
  still comes through the window, the door still opens, the music still
  starts) — just without the camera, bars or held input — and leave the
  camera, zoom, HUD camera and input as the cinematic would have left them.
- This applies to every new cinematic added from now on.
