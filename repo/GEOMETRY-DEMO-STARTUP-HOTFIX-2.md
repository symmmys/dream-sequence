# Geometry demo startup hotfix 2

## What the repeated stack trace means

The previous repaired source already routed visibility through `setWorldManagerVisibility()`. The repeated `this.destinationWorldManager.setVisible is not a function` stack therefore indicates that the browser was executing an older module, or the server was started from a different project directory. The direct call is absent from the repaired `GeometryDemoWorld.setActive()` implementation.

## Changes

- Added a version marker to startup and geometry-demo console output.
- Added cache-version query strings to the HTML entry module, the `main.js` scene import, and the scene's geometry-demo import. This forces the browser to request the repaired composition modules under new URLs.
- Hardened `WorldManager.setVisible()` as an explicit, safe manager API, including calls before chunk initialization. Kept the demo adapter as a compatibility boundary, including a fallback when a legacy method exists but throws.
- Added a contract test proving the current `WorldManager` exposes `setVisible()`.
- Added a regression test proving that a throwing legacy method falls back to resident chunks.

## How to verify the correct build

After extracting this archive, start Python from the directory that directly contains `index.html`. Open the app and look for both console messages:

- `[Main] Build: 2026-11-07-startup-fix-2`
- `[GeometryDemo] Build: 2026-11-07-startup-fix-2`

If either message is missing, the browser is not running this project copy. Check the terminal's current working directory with `pwd`, then verify `test -f index.html` before starting the server.
