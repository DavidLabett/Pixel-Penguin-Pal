# Companion Widget

A small desktop penguin that lives on your screen, reacts to typing, and runs a Pomodoro timer.

## Requirements

- Node.js 18+
- Windows (uses `uiohook-napi` for global keyboard hooks)
- Visual C++ Build Tools (for native module compilation)

## Setup

```bash
npm install
npm run rebuild
```

## Run

```bash
npm start
```

## Usage

| Action | Effect |
|---|---|
| Left-click | Start / pause Pomodoro timer |
| Drag | Move the widget anywhere on screen |
| Right-click tray icon | Start, Stop, Reset, Quit |

## Animations

| State | Sprite |
|---|---|
| Idle | `Idle.png` (with random `Crouch` / `Turn` variations every 8–15 s) |
| Typing | `Walk.png` |
| Typing fast (≥4 keys/sec) | `Roll.png` |
| Pomodoro break | `Spin_Attack.png` |
| Timer ringing | `Hurt.png` (plays once) |

## Pomodoro

- Work session: 25 minutes  
- Short break: 5 minutes  
- Long break (every 4 cycles): 15 minutes  
- The countdown is shown below the sprite while the timer is running.
