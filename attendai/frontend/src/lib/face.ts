import type * as FaceApi from "@vladmandic/face-api";

type Api = typeof FaceApi;
let loading: Promise<Api> | null = null;
/** Which engine runs the model: "webgl" (fast, uses the graphics card) or "cpu" (slow). Shown in the camera readout. */
export let backendName = "";

/** Loads the face library and its three models once. The first call downloads about 7 MB; after that the browser keeps them. */
export function loadFace(): Promise<Api> {
  loading ??= (async () => {
    const faceapi = await import("@vladmandic/face-api");
    const tf = faceapi.tf as unknown as { ready(): Promise<void>; getBackend(): string; setBackend(n: string): Promise<boolean> };
    await tf.ready();
    if (tf.getBackend() !== "webgl") await tf.setBackend("webgl").then(() => tf.ready()).catch(() => undefined);
    backendName = tf.getBackend();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    return faceapi;
  })().catch((e) => {
    loading = null; // let the next attempt try again
    throw e;
  });
  return loading;
}

export interface FaceFrame {
  score: number;
  ear: number; // how open the eyes are (eye aspect ratio)
  yaw: number; // 0.5 when facing the camera, lower or higher as the head turns
  big: boolean; // close enough to the camera
  size: number; // how much of the picture width the face fills
  centered: boolean;
}

type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye aspect ratio from the six landmarks around one eye: about 0.3 when open, under 0.2 when closed. */
export function eyeRatio(p: Point[]) {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
}

const OPTIONS = (faceapi: Api) => new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 });

/** One quick look at the camera: is there a face, is it well placed, are the eyes open? */
export async function inspect(video: HTMLVideoElement): Promise<FaceFrame | null> {
  const faceapi = await loadFace();
  const r = await faceapi.detectSingleFace(video, OPTIONS(faceapi)).withFaceLandmarks();
  if (!r) return null;
  const pts = r.landmarks.positions;
  const { x, y, width, height } = r.detection.box;
  const W = video.videoWidth, H = video.videoHeight;
  return {
    score: r.detection.score,
    yaw: (pts[30].x - pts[0].x) / (pts[16].x - pts[0].x),
    ear: (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2,
    big: width / W >= 0.14,
    size: width / W,
    centered: Math.abs(x + width / 2 - W / 2) < W * 0.25 && Math.abs(y + height / 2 - H / 2) < H * 0.3,
  };
}

/** The 128 numbers that describe the face in front of the camera, or null if none is found.
 *  Right after a blink the eyes can still be half shut and the detector may miss for a frame or two,
 *  so it tries up to `tries` times, with a more forgiving threshold on the later attempts. */
export async function describe(video: HTMLVideoElement, tries = 12): Promise<number[] | null> {
  const faceapi = await loadFace();
  for (let i = 0; i < tries; i++) {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: i < 4 ? 320 : 416, scoreThreshold: i < 4 ? 0.5 : 0.3 });
    const r = await faceapi.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
    if (r) return Array.from(r.descriptor);
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** Spots one blink in a stream of eye readings: the eyes close a little, then open again.
 *  It first learns what "open" looks like for this person, so glasses and eye shape don't matter.
 *  Laptop cameras are read only a few times a second and the face model shows a closing eye as a modest dip,
 *  so the thresholds are deliberately gentle and the length of the blink is judged in time, not in frames.
 *  This makes a held-up photo fail. It will not stop a video of the person, so it is a hurdle, not a guarantee. */
export class BlinkDetector {
  private seen: number[] = [];
  private baseline = 0;
  private closed = 0;
  private closedAt = 0;

  get ready() {
    return this.baseline > 0;
  }

  reset() {
    this.seen = [];
    this.baseline = 0;
    this.closed = 0;
    this.closedAt = 0;
  }

  /** Feed one reading per frame. Returns true when a complete blink has just been seen. */
  push(ear: number, now: number = Date.now()): boolean {
    if (!this.ready) {
      this.seen.push(ear);
      if (this.seen.length >= 5) {
        const m = median(this.seen);
        if (m > 0.18) this.baseline = m; // too low means squinting or a bad reading, so keep learning
        else this.seen.shift();
      }
      return false;
    }
    if (ear < this.baseline * 0.86) {
      if (this.closed === 0) this.closedAt = now;
      this.closed += 1;
      return false;
    }
    if (ear > this.baseline * 0.93) {
      const blinked = this.closed >= 1 && this.closed <= 15 && now - this.closedAt <= 1800;
      this.closed = 0;
      if (blinked) return true;
      this.baseline = this.baseline * 0.95 + ear * 0.05; // follow slow changes in lighting and posture
    }
    return false;
  }
}

/** Spots a head turn: the nose moves clearly to one side of the face, then comes back to the middle.
 *  Much easier for a webcam to see than a blink. A flat photo can be tilted, so this is also only a hurdle. */
export class TurnDetector {
  private seen: number[] = [];
  private base = 0;
  private turned = false;

  get ready() {
    return this.base > 0;
  }

  reset() {
    this.seen = [];
    this.base = 0;
    this.turned = false;
  }

  /** Feed the yaw of every frame. Returns true when the head has turned and come back. */
  push(yaw: number): boolean {
    if (!this.ready) {
      this.seen.push(yaw);
      if (this.seen.length >= 5) this.base = median(this.seen);
      return false;
    }
    const d = Math.abs(yaw - this.base);
    if (d > 0.10) this.turned = true;
    else if (d < 0.07 && this.turned) {
      this.turned = false;
      return true;
    }
    return false;
  }
}
