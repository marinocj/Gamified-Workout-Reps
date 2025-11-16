"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

// ------------------------------------------------------------------
// Pose / push-up related types & helpers
// ------------------------------------------------------------------

type RunningMode = "IMAGE" | "VIDEO";

type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

type FrameFeatures = {
  t: number; // seconds
  elbowAngle: number | null;
  hipAngle: number | null;
  headY: number | null;
  shoulderY: number | null;
  hipY: number | null;
};

type RepFeature = FrameFeatures;

type CompletedRep = {
  features: RepFeature[];
  correctness: number; // 0–100
};

type PushupState =
  | "WAITING_FOR_START"
  | "AT_TOP"
  | "GOING_DOWN"
  | "AT_BOTTOM"
  | "GOING_UP";

type SquatState =
  | "WAITING_FOR_START"
  | "STANDING"
  | "GOING_DOWN"
  | "AT_BOTTOM"
  | "GOING_UP";

interface PushupTemplate {
  phaseCount: number;
  elbow: { mean: number[]; std: number[] };
  hip: { mean: number[]; std: number[] };
  headY: { mean: number[]; std: number[] }; // kept for compatibility, but not used
}

type DebugFrame = {
  t: number;
  state: PushupState;
  features: FrameFeatures;
  landmarks: Landmark[];
};

type ExerciseType = "PUSHUPS" | "SQUATS" | "RIGHT_HAND_Y" | "LEFT_HAND_Y";

// 👇 change this to "SQUATS", "RIGHT_HAND_Y", or "LEFT_HAND_Y"
const excType: ExerciseType = "RIGHT_HAND_Y";

// MediaPipe landmark indices
const NOSE = 0;

const L_SHOULDER = 11;
const L_ELBOW = 13;
const L_WRIST = 15;
const L_HIP = 23;
const L_KNEE = 25;
const L_ANKLE = 27;

const R_SHOULDER = 12;
const R_ELBOW = 14;
const R_WRIST = 16;
const R_HIP = 24;
const R_KNEE = 26;
const R_ANKLE = 28;

// ------------------------------------------------------------------
// Thresholds
// ------------------------------------------------------------------

// Push-up thresholds
const ELBOW_TOP_ANGLE = 160; // arms mostly straight
const ELBOW_BOTTOM_ANGLE = 90; // arms clearly bent
const MIN_ANGLE_DELTA = 40; // min required elbow range-of-motion

// More forgiving hip straightness for "top" position
const HIP_STRAIGHT_ANGLE = 150; // body roughly straight at top

// Visibility + posture gating
// Now based on AVERAGE visibility across key joints, not min.
const MIN_VIS_BODY = 0.4;

// Body must be roughly horizontal (shoulder vs hip y-diff)
const HORIZONTAL_BODY_MAX_DELTA_Y = 0.3;

// Frames of good "top" needed to start
const START_TOP_STREAK = 3;

// Rep validity (pushups)
const MIN_VALID_FRAMES_PER_REP = 6; // small but non-trivial
const BOTTOM_ANGLE_MARGIN = 10; // how close to ELBOW_BOTTOM_ANGLE we require

// Squat thresholds
const SQUAT_KNEE_TOP_ANGLE = 165; // standing-ish
const SQUAT_KNEE_BOTTOM_ANGLE = 100; // deep-ish squat
const SQUAT_MIN_ANGLE_DELTA = 35;
const SQUAT_MIN_VALID_FRAMES = 6;

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

function angleDegrees(a: Landmark, b: Landmark, c: Landmark): number | null {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return null;

  let cos = dot / (mag1 * mag2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

function avg(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

// STRICT: only produce angles if average visibility is high enough
function extractFrameFeatures(
  landmarks: Landmark[],
  t: number
): FrameFeatures {
  const lSh = landmarks[L_SHOULDER];
  const lEl = landmarks[L_ELBOW];
  const lWr = landmarks[L_WRIST];
  const rSh = landmarks[R_SHOULDER];
  const rEl = landmarks[R_ELBOW];
  const rWr = landmarks[R_WRIST];

  const lHip = landmarks[L_HIP];
  const lAnk = landmarks[L_ANKLE];
  const rHip = landmarks[R_HIP];
  const rAnk = landmarks[R_ANKLE];

  const nose = landmarks[NOSE];

  // 1) Require key joints to be confidently visible
  const keyJoints = [lSh, lEl, lWr, rSh, rEl, rWr, lHip, lAnk, rHip, rAnk];

  let visSum = 0;
  let visCount = 0;
  for (const j of keyJoints) {
    if (j) {
      visSum += j.visibility ?? 0;
      visCount++;
    }
  }
  const avgVis = visCount > 0 ? visSum / visCount : 0;
  const jointsVisibleEnough = avgVis >= MIN_VIS_BODY;

  const shoulderY = avg(lSh?.y ?? null, rSh?.y ?? null);
  const hipY = avg(lHip?.y ?? null, rHip?.y ?? null);
  const headY = nose?.y ?? null;

  if (!jointsVisibleEnough) {
    // Keep positional info for UI, but no angles so state machine skips this frame
    return {
      t,
      elbowAngle: null,
      hipAngle: null,
      headY,
      shoulderY,
      hipY,
    };
  }

  const leftElbow = angleDegrees(lSh, lEl, lWr);
  const rightElbow = angleDegrees(rSh, rEl, rWr);
  const elbowAngle = avg(leftElbow, rightElbow);

  const leftHip = angleDegrees(lSh, lHip, lAnk);
  const rightHip = angleDegrees(rSh, rHip, rAnk);
  const hipAngle = avg(leftHip, rightHip);

  return {
    t,
    elbowAngle,
    hipAngle,
    headY,
    shoulderY,
    hipY,
  };
}

// Resample a rep's features onto a fixed number of "phases" [0..1]
// NOTE: Used only for scoring, not for validity.
function resampleRep(
  features: RepFeature[],
  phaseCount: number
): { elbow: number; hip: number }[] {
  if (!features.length) return [];
  const t0 = features[0].t;
  const t1 = features[features.length - 1].t;
  const duration = t1 - t0 || 1;

  const result: { elbow: number; hip: number }[] = [];

  for (let i = 0; i < phaseCount; i++) {
    const targetPhase = i / (phaseCount - 1);
    const targetT = t0 + targetPhase * duration;

    // nearest neighbor (simple + robust)
    let best = features[0];
    let bestDt = Math.abs(features[0].t - targetT);
    for (const f of features) {
      const dt = Math.abs(f.t - targetT);
      if (dt < bestDt) {
        best = f;
        bestDt = dt;
      }
    }

    result.push({
      elbow: best.elbowAngle ?? 0,
      hip: best.hipAngle ?? 0,
    });
  }

  return result;
}

// ------------------------------------------------------------------
// React component
// ------------------------------------------------------------------

const VIDEO_HEIGHT = 360;
const VIDEO_WIDTH = 480;

const PoseLandmarkerPage: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [hasWebcamSupport, setHasWebcamSupport] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const runningModeRef = useRef<RunningMode>("IMAGE");
  const webcamRunningRef = useRef<boolean>(false);
  const lastVideoTimeRef = useRef<number>(-1);

  // Push-up detection state
  const pushupStateRef = useRef<PushupState>("WAITING_FOR_START");
  const lastStateRef = useRef<PushupState>("WAITING_FOR_START");
  const currentRepRef = useRef<RepFeature[]>([]);
  const completedRepsRef = useRef<CompletedRep[]>([]);
  const baselineHeadYRef = useRef<number | null>(null);
  const topStreakRef = useRef(0); // debounce for starting position

  // Squat detection state
  const squatStateRef = useRef<SquatState>("WAITING_FOR_START");
  const squatCurrentRepAnglesRef = useRef<number[]>([]);
  const squatTopStreakRef = useRef(0);

  // DEBUG: last 50 frames (for pushups)
  const debugFramesRef = useRef<DebugFrame[]>([]);

  // UI-only state kept internally (no on-screen text anymore)
  const [lastRepScore, setLastRepScore] = useState<number | null>(null);
  const [currentStateLabel, setCurrentStateLabel] =
    useState<string>("Waiting");
  const [startingPositionDetected, setStartingPositionDetected] =
    useState(false);
  const [uiRepCount, setUiRepCount] = useState(0);

  // Optional template for advanced scoring (loaded from /public/pushup_template.json)
  const [pushupTemplate, setPushupTemplate] = useState<PushupTemplate | null>(
    null
  );

  // Load PoseLandmarker
  useEffect(() => {
    const createPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });

      poseLandmarkerRef.current = poseLandmarker;
      setIsReady(true);
    };

    createPoseLandmarker().catch((err) => {
      console.error("Failed to create PoseLandmarker:", err);
    });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasWebcamSupport(false);
    }

    // Cleanup webcam
    return () => {
      const video = videoRef.current;
      if (video && video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        video.srcObject = null;
      }
    };
  }, []);

  // Load push-up template (if you created pushup_template.json in public/)
  useEffect(() => {
    fetch("/pushup_template.json")
      .then((res) => {
        if (!res.ok) throw new Error("No template found");
        return res.json();
      })
      .then((data: PushupTemplate) => {
        setPushupTemplate(data);
        console.log("Loaded push-up template");
      })
      .catch(() => {
        console.warn(
          "No pushup_template.json found; using rule-based scoring only."
        );
      });
  }, []);

  // ----------------------------------------------------------------
  // Rep validation & scoring (PUSHUPS ONLY — logic unchanged)
  // ----------------------------------------------------------------

  const repIsValid = (features: RepFeature[]): boolean => {
    const elbowAngles = features
      .map((f) => f.elbowAngle)
      .filter((v): v is number => v != null);

    if (!elbowAngles.length) return false;

    // Need a reasonable number of usable frames
    if (elbowAngles.length < MIN_VALID_FRAMES_PER_REP) return false;

    const minElbow = Math.min(...elbowAngles);
    const maxElbow = Math.max(...elbowAngles);
    const elbowRange = maxElbow - minElbow;

    // Require clear range-of-motion
    if (elbowRange < MIN_ANGLE_DELTA) return false;

    // Require reaching "bottom" at least once
    const reachedBottom = minElbow <= ELBOW_BOTTOM_ANGLE + BOTTOM_ANGLE_MARGIN;
    if (!reachedBottom) return false;

    return true;
  };

  const scoreRep = (features: RepFeature[]): number => {
    // If we have a template from your dataset, use it (but VERY forgiving)
    if (pushupTemplate) {
      const phaseCount = pushupTemplate.phaseCount;
      const repPhases = resampleRep(features, phaseCount);
      if (repPhases.length !== phaseCount) return 0;

      let totalZ = 0;
      let count = 0;

      for (let i = 0; i < phaseCount; i++) {
        const rep = repPhases[i];

        const mE = pushupTemplate.elbow.mean[i];
        const sE = pushupTemplate.elbow.std[i] || 1;
        const zE = Math.abs(rep.elbow - mE) / sE;

        const mH = pushupTemplate.hip.mean[i];
        const sH = pushupTemplate.hip.std[i] || 1;
        const zH = Math.abs(rep.hip - mH) / sH;

        // NOTE: headY is ignored to avoid camera-position bias
        totalZ += zE + zH;
        count += 2;
      }

      const avgZ = totalZ / count; // lower is better

      // VERY forgiving mapping
      const raw = 100 - 10 * avgZ;
      const percent = Math.max(0, Math.min(100, raw));
      return percent;
    }

    // Fallback: simple & forgiving rule-based scoring if no template is loaded
    const elbowAngles = features
      .map((f) => f.elbowAngle)
      .filter((v): v is number => v != null);
    const hipAngles = features
      .map((f) => f.hipAngle)
      .filter((v): v is number => v != null);

    if (!elbowAngles.length || !hipAngles.length) return 0;

    const minElbow = Math.min(...elbowAngles);
    const maxElbow = Math.max(...elbowAngles);
    const elbowRange = maxElbow - minElbow;

    const maxHip = Math.max(...hipAngles);

    // Range-of-motion component (0–70 points)
    const rangeScore = Math.max(0, Math.min(1, elbowRange / 80));
    const rangePoints = rangeScore * 70;

    // Body straightness component (0–30 points)
    const hipScore = Math.max(0, Math.min(1, (maxHip - 140) / 40));
    const hipPoints = hipScore * 30;

    return Math.max(0, Math.min(100, rangePoints + hipPoints));
  };

  // ----------------------------------------------------------------
  // Push-up state machine (PUSHUPS ONLY — logic unchanged)
  // ----------------------------------------------------------------

  const updatePushupState = (features: FrameFeatures) => {
    const state = pushupStateRef.current;
    const { elbowAngle, hipAngle, headY, shoulderY, hipY } = features;

    // If we don't even have joint angles, bail
    if (elbowAngle == null || hipAngle == null) {
      // Reset start streak so random partial frames don't accumulate
      if (state === "WAITING_FOR_START") {
        topStreakRef.current = 0;
      }
      return;
    }

    // Require body to be roughly horizontal (push-up posture),
    // not vertical (standing / face-only).
    if (shoulderY == null || hipY == null) {
      return;
    }
    const bodyDeltaY = Math.abs(shoulderY - hipY);
    const bodyIsHorizontal = bodyDeltaY <= HORIZONTAL_BODY_MAX_DELTA_Y;

    if (!bodyIsHorizontal) {
      // If they stand up or only upper body is in view, reset detection
      if (state !== "WAITING_FOR_START") {
        pushupStateRef.current = "WAITING_FOR_START";
        setCurrentStateLabel("WAITING_FOR_START");
        setStartingPositionDetected(false);
        currentRepRef.current = [];
        topStreakRef.current = 0;
      }
      return;
    }

    const atTop =
      elbowAngle >= ELBOW_TOP_ANGLE && hipAngle >= HIP_STRAIGHT_ANGLE;
    const atBottom = elbowAngle <= ELBOW_BOTTOM_ANGLE;

    const setStateIfChanged = (newState: PushupState) => {
      if (newState !== pushupStateRef.current) {
        pushupStateRef.current = newState;
        lastStateRef.current = newState;
        setCurrentStateLabel(newState);
      }
    };

    switch (state) {
      case "WAITING_FOR_START":
        if (atTop) {
          // debounce: require several consecutive good top frames
          topStreakRef.current += 1;
          if (topStreakRef.current >= START_TOP_STREAK) {
            setStateIfChanged("AT_TOP");
            currentRepRef.current = [features];
            baselineHeadYRef.current = headY ?? null;
            setStartingPositionDetected(true);
          }
        } else {
          topStreakRef.current = 0;
        }
        break;

      case "AT_TOP":
        currentRepRef.current.push(features);
        if (!atTop && elbowAngle < ELBOW_TOP_ANGLE - 5) {
          setStateIfChanged("GOING_DOWN");
        }
        break;

      case "GOING_DOWN":
        currentRepRef.current.push(features);
        if (atBottom) {
          setStateIfChanged("AT_BOTTOM");
        } else if (atTop) {
          // aborted, back to top without real rep
          setStateIfChanged("AT_TOP");
          currentRepRef.current = [features];
        }
        break;

      case "AT_BOTTOM":
        currentRepRef.current.push(features);
        if (!atBottom && elbowAngle > ELBOW_BOTTOM_ANGLE + 5) {
          setStateIfChanged("GOING_UP");
        }
        break;

      case "GOING_UP":
        currentRepRef.current.push(features);
        if (atTop) {
          const repFeatures = currentRepRef.current;

          if (repIsValid(repFeatures)) {
            const score = scoreRep(repFeatures);
            completedRepsRef.current.push({
              features: repFeatures,
              correctness: score,
            });

            const repCount = completedRepsRef.current.length;

            setUiRepCount(repCount);
            setLastRepScore(score);
            console.log(
              "Push-up completed. Score:",
              score,
              "Total reps:",
              repCount
            );

            // 🔔 FIRE BROWSER EVENT WHEN A VALID PUSH-UP COMPLETES
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("pushupCompleted", {
                  detail: {
                    score,
                    repCount,
                    timestamp: Date.now(),
                  },
                })
              );
            }
          } else {
            console.log("Push-up rejected as invalid rep.");
          }

          // Ready for next rep
          setStateIfChanged("AT_TOP");
          currentRepRef.current = [features];
          if (baselineHeadYRef.current == null && headY != null) {
            baselineHeadYRef.current = headY;
          }
        }
        break;
    }
  };

  // ----------------------------------------------------------------
  // Squat detection (SQUATS)
  // ----------------------------------------------------------------

  const updateSquatState = (landmarks: Landmark[], t: number) => {
    const state = squatStateRef.current;

    const lHip = landmarks[L_HIP];
    const rHip = landmarks[R_HIP];
    const lKnee = landmarks[L_KNEE];
    const rKnee = landmarks[R_KNEE];
    const lAnk = landmarks[L_ANKLE];
    const rAnk = landmarks[R_ANKLE];

    const keyJoints = [lHip, rHip, lKnee, rKnee, lAnk, rAnk];

    let visSum = 0;
    let visCount = 0;
    for (const j of keyJoints) {
      if (j) {
        visSum += j.visibility ?? 0;
        visCount++;
      }
    }
    const avgVis = visCount > 0 ? visSum / visCount : 0;
    if (avgVis < MIN_VIS_BODY) {
      if (state === "WAITING_FOR_START") {
        squatTopStreakRef.current = 0;
      }
      return;
    }

    const leftKneeAngle = lHip && lKnee && lAnk ? angleDegrees(lHip, lKnee, lAnk) : null;
    const rightKneeAngle =
      rHip && rKnee && rAnk ? angleDegrees(rHip, rKnee, rAnk) : null;

    let kneeAngle: number | null = null;
    if (leftKneeAngle != null && rightKneeAngle != null) {
      kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    } else if (leftKneeAngle != null) {
      kneeAngle = leftKneeAngle;
    } else if (rightKneeAngle != null) {
      kneeAngle = rightKneeAngle;
    }

    if (kneeAngle == null) {
      return;
    }

    const atTop = kneeAngle >= SQUAT_KNEE_TOP_ANGLE;
    const atBottom = kneeAngle <= SQUAT_KNEE_BOTTOM_ANGLE;

    const setStateIfChanged = (newState: SquatState) => {
      if (newState !== squatStateRef.current) {
        squatStateRef.current = newState;
      }
    };

    switch (state) {
      case "WAITING_FOR_START":
        if (atTop) {
          squatTopStreakRef.current += 1;
          if (squatTopStreakRef.current >= START_TOP_STREAK) {
            setStateIfChanged("STANDING");
            squatCurrentRepAnglesRef.current = [kneeAngle];
          }
        } else {
          squatTopStreakRef.current = 0;
        }
        break;

      case "STANDING":
        squatCurrentRepAnglesRef.current.push(kneeAngle);
        if (!atTop && kneeAngle < SQUAT_KNEE_TOP_ANGLE - 5) {
          setStateIfChanged("GOING_DOWN");
        }
        break;

      case "GOING_DOWN":
        squatCurrentRepAnglesRef.current.push(kneeAngle);
        if (atBottom) {
          setStateIfChanged("AT_BOTTOM");
        } else if (atTop) {
          // aborted
          setStateIfChanged("STANDING");
          squatCurrentRepAnglesRef.current = [kneeAngle];
        }
        break;

      case "AT_BOTTOM":
        squatCurrentRepAnglesRef.current.push(kneeAngle);
        if (!atBottom && kneeAngle > SQUAT_KNEE_BOTTOM_ANGLE + 5) {
          setStateIfChanged("GOING_UP");
        }
        break;

      case "GOING_UP":
        squatCurrentRepAnglesRef.current.push(kneeAngle);
        if (atTop) {
          const angles = squatCurrentRepAnglesRef.current.slice();
          if (angles.length >= SQUAT_MIN_VALID_FRAMES) {
            const minKnee = Math.min(...angles);
            const maxKnee = Math.max(...angles);
            const range = maxKnee - minKnee;

            const reachedBottom =
              minKnee <= SQUAT_KNEE_BOTTOM_ANGLE + 5 && range >= SQUAT_MIN_ANGLE_DELTA;

            if (reachedBottom) {
              // Treat all valid squats as 100% correctness for now
              completedRepsRef.current.push({
                features: [],
                correctness: 100,
              });
              const repCount = completedRepsRef.current.length;
              setUiRepCount(repCount);
              setLastRepScore(100);
              console.log("Squat completed. Total reps:", repCount);

              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("squatCompleted", {
                    detail: {
                      repCount,
                      timestamp: Date.now(),
                    },
                  })
                );
              }
            }
          }

          setStateIfChanged("STANDING");
          squatCurrentRepAnglesRef.current = [kneeAngle];
        }
        break;
    }
  };

  // ----------------------------------------------------------------
  // Hand Y tracker (RIGHT_HAND_Y / LEFT_HAND_Y)
  // ----------------------------------------------------------------

  const trackHandY = (landmarks: Landmark[], hand: "LEFT" | "RIGHT") => {
    const wristIndex = hand === "LEFT" ? L_WRIST : R_WRIST;
    const wrist = landmarks[wristIndex];
    if (!wrist) return;

    const vis = wrist.visibility ?? 0;
    if (vis < MIN_VIS_BODY) return;

    // MediaPipe y: 0 at top, 1 at bottom
    const yClamped = Math.max(0, Math.min(1, wrist.y));
    const yNorm = 1 - yClamped; // bottom=0, top=1

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("handYUpdate", {
          detail: {
            hand,
            y: yNorm,
            timestamp: Date.now(),
          },
        })
      );

      console.log(`Hand ${hand} Y:`, yNorm.toFixed(3));
    }
  };

  // ----------------------------------------------------------------
  // DEBUG: download last 50 frames as JSON (pushups only)
  // ----------------------------------------------------------------

  const handleDownloadDebugFrames = () => {
    const frames = debugFramesRef.current;
    const data = {
      frameCount: frames.length,
      frames,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debug_last_50_frames.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ----------------------------------------------------------------
  // Webcam + MediaPipe loop
  // ----------------------------------------------------------------

  const predictWebcam = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    if (!video || !canvas || !poseLandmarker) return;

    runningModeRef.current = "VIDEO";
    await poseLandmarker.setOptions({ runningMode: "VIDEO" });

    const nowMs = performance.now();

    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      poseLandmarker.detectForVideo(video, nowMs, (result: any) => {
        const poses: Landmark[][] = result.landmarks;
        const firstPose = poses?.[0];

        if (firstPose) {
          const t = video.currentTime || 0;

          if (excType === "PUSHUPS") {
            const features = extractFrameFeatures(firstPose, t);

            // Update state first
            updatePushupState(features);

            // DEBUG: store last 50 frames (state + features + landmarks)
            const debugFrame: DebugFrame = {
              t,
              state: pushupStateRef.current,
              features,
              landmarks: firstPose,
            };
            const buf = debugFramesRef.current;
            buf.push(debugFrame);
            if (buf.length > 50) {
              buf.shift();
            }
          } else if (excType === "SQUATS") {
            updateSquatState(firstPose, t);
          } else if (excType === "RIGHT_HAND_Y") {
            trackHandY(firstPose, "RIGHT");
          } else if (excType === "LEFT_HAND_Y") {
            trackHandY(firstPose, "LEFT");
          }
        }

        const drawingUtils = new DrawingUtils(ctx);

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const landmark of result.landmarks) {
          drawingUtils.drawLandmarks(landmark, {
            radius: (data: { from?: { z: number } }) => {
              const z = data.from?.z ?? 0;
              return DrawingUtils.lerp(z, -0.15, 0.1, 5, 1);
            },
          });
          drawingUtils.drawConnectors(
            landmark,
            PoseLandmarker.POSE_CONNECTIONS
          );
        }

        ctx.restore();
      });
    }

    if (webcamRunningRef.current) {
      window.requestAnimationFrame(predictWebcam);
    }
  };

  const handleToggleWebcam = () => {
    const poseLandmarker = poseLandmarkerRef.current;
    if (!poseLandmarker) {
      console.log("Wait! poseLandmarker not loaded yet.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasWebcamSupport(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (webcamRunningRef.current) {
      // Turn OFF
      webcamRunningRef.current = false;

      if (video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      video.srcObject = null;
    } else {
      // Turn ON
      webcamRunningRef.current = true;

      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream: MediaStream) => {
          video.srcObject = stream;
          video.onloadeddata = () => {
            predictWebcam().catch((err) =>
              console.error("predictWebcam error", err)
            );
          };
        })
        .catch((err) => {
          console.error(err);
          webcamRunningRef.current = false;
        });
    }
  };

  // Automatically start webcam once model is ready and webcam is supported
  useEffect(() => {
    if (
      isReady &&
      hasWebcamSupport &&
      !webcamRunningRef.current &&
      videoRef.current
    ) {
      handleToggleWebcam();
    }
  }, [isReady, hasWebcamSupport]);

  // Make body take full screen with no scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalMargin = document.body.style.margin;
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.margin = originalMargin;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        padding: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "black",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
        }}
      />
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export default PoseLandmarkerPage;
