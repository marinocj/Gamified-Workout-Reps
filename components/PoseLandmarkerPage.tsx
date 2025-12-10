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

// MediaPipe landmark indices
const NOSE = 0;

const L_SHOULDER = 11;
const L_ELBOW = 13;
const L_WRIST = 15;
const L_HIP = 23;
const L_ANKLE = 27;

const R_SHOULDER = 12;
const R_ELBOW = 14;
const R_WRIST = 16;
const R_HIP = 24;
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

// Rep validity
const MIN_VALID_FRAMES_PER_REP = 6; // small but non-trivial
const BOTTOM_ANGLE_MARGIN = 10; // how close to ELBOW_BOTTOM_ANGLE we require

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

// ------------------------------------------------------------------
// React component
// ------------------------------------------------------------------

const VIDEO_HEIGHT = 360;
const VIDEO_WIDTH = 480;

interface PoseLandmarkerPageProps {
  width?: number;
  height?: number;
  embedded?: boolean; // If true, renders as a contained component instead of fullscreen
}

const PoseLandmarkerPage: React.FC<PoseLandmarkerPageProps> = ({ 
  width = 480, 
  height = 360, 
  embedded = false 
}) => {
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
  const currentRepRef = useRef<RepFeature[]>([]);
  const completedRepsRef = useRef<CompletedRep[]>([]);
  const topStreakRef = useRef(0);
  const [uiRepCount, setUiRepCount] = useState(0);

  // Load PoseLandmarker
  useEffect(() => {
    const createPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
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

  // ----------------------------------------------------------------
  // Rep validation & scoring
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
    // Simple & forgiving rule-based scoring
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
  // Push-up state machine (called every frame)
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
            console.log(
              "Push-up completed. Score:",
              score,
              "Total reps:",
              repCount
            );

            // ----------------------------------------------------
            // 🔔 FIRE BROWSER EVENT WHEN A VALID PUSH-UP COMPLETES
            // ----------------------------------------------------
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
        }
        break;
    }
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
          const features = extractFrameFeatures(firstPose, t);
          updatePushupState(features);
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

  // Make body take full screen with no scroll (only when not embedded)
  useEffect(() => {
    if (embedded) return; // Skip fullscreen styling when embedded
    
    const originalOverflow = document.body.style.overflow;
    const originalMargin = document.body.style.margin;
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.margin = originalMargin;
    };
  }, [embedded]);

  return (
    <div
      style={{
        position: embedded ? "relative" : "fixed",
        inset: embedded ? "auto" : 0,
        margin: 0,
        padding: 0,
        width: embedded ? `${width}px` : "100vw",
        height: embedded ? `${height}px` : "100vh",
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
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export default PoseLandmarkerPage;

/*
Detail Payload:
{
  score: number;      // 0–100
  repCount: number;   // total completed reps so far
  timestamp: number;  // Date.now()
}

*/

/*
How to listen to the detail payload:

window.addEventListener("pushupCompleted", (e: any) => {
  console.log("Pushup event:", e.detail);
});

*/