const FRAME_SIZE = 64;
const SCALE = 2;

// All values confirmed from sprite sheet inspection:
// each sheet is a horizontal strip of FRAME_SIZE-wide frames, all 64px tall.
const SPRITE_CONFIG = {
  Idle:        { frameCount: 2, fps: 4  },
  Crouch:      { frameCount: 1, fps: 4  },
  Turn:        { frameCount: 1, fps: 4  },
  Walk:        { frameCount: 6, fps: 10 },
  Roll:        { frameCount: 4, fps: 12 },
  Spin_Attack: { frameCount: 7, fps: 10 },
  Hurt:        { frameCount: 4, fps: 8  },
  Flap:        { frameCount: 2, fps: 8  },
  Death:       { frameCount: 1, fps: 4  },
  Jump:        { frameCount: 2, fps: 10 },
};

export class SpriteAnimator {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} spritesBasePath  - path prefix for sprite sheet images
   */
  constructor(canvas, spritesBasePath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.basePath = spritesBasePath;

    this.canvas.width = FRAME_SIZE * SCALE;
    this.canvas.height = FRAME_SIZE * SCALE;

    this.images = {};        // cache: name → HTMLImageElement
    this.currentSheet = null;
    this.currentConfig = null;
    this.currentFrame = 0;
    this.lastFrameTime = 0;
    this.onCycleComplete = null; // callback fired when a non-looping sheet finishes

    this._rafId = null;
    this._loop = this._loop.bind(this);
  }

  /** Pre-load all sprite sheets used by the state machine */
  async preload() {
    const names = Object.keys(SPRITE_CONFIG);
    await Promise.all(names.map(name => this._loadImage(name)));
  }

  _loadImage(name) {
    return new Promise((resolve) => {
      if (this.images[name]) return resolve(this.images[name]);
      const img = new Image();
      img.src = `${this.basePath}/${name}.png`;
      img.onload = () => {
        this.images[name] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
    });
  }

  /**
   * Switch to a different sprite sheet.
   * @param {string} name - key in SPRITE_CONFIG
   * @param {boolean} [loop=true] - if false, fires onCycleComplete after one pass
   */
  /**
   * @param {string}  name
   * @param {boolean} [loop=true]
   * @param {boolean} [force=false] – restart even if already playing this sheet
   */
  play(name, loop = true, force = false) {
    if (!force && this.currentSheet === name) return;
    this.currentSheet = name;
    this.currentConfig = SPRITE_CONFIG[name];
    this.currentFrame = 0;
    this.lastFrameTime = 0;
    this._loop_mode = loop;
    this._started = false;

    if (!this._rafId) {
      this._rafId = requestAnimationFrame(this._loop);
    }
  }

  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _loop(timestamp) {
    const cfg = this.currentConfig;
    if (!cfg) {
      this._rafId = requestAnimationFrame(this._loop);
      return;
    }

    const frameDuration = 1000 / cfg.fps;
    if (!this.lastFrameTime) this.lastFrameTime = timestamp;

    if (timestamp - this.lastFrameTime >= frameDuration) {
      this.lastFrameTime = timestamp;
      this.currentFrame++;

      if (this.currentFrame >= cfg.frameCount) {
        if (!this._loop_mode) {
          // non-looping: hold last frame and fire callback
          this.currentFrame = cfg.frameCount - 1;
          this._draw();
          this._rafId = null;
          if (this.onCycleComplete) this.onCycleComplete(this.currentSheet);
          return;
        }
        this.currentFrame = 0;
      }
    }

    this._draw();
    this._rafId = requestAnimationFrame(this._loop);
  }

  _draw() {
    const img = this.images[this.currentSheet];
    if (!img) return;
    const cfg = this.currentConfig;
    const sx = this.currentFrame * FRAME_SIZE;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      img,
      sx, 0, FRAME_SIZE, FRAME_SIZE,          // source rect
      0,  0, FRAME_SIZE * SCALE, FRAME_SIZE * SCALE  // dest rect (scaled)
    );
  }
}
