import * as posenet from "@tensorflow-models/posenet";
import * as handpose from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs";
import { HandKeypoints, Keypoints, MachineType } from "config/shared";
import { PoseNetQuantBytes } from "@tensorflow-models/posenet/dist/types";
import { SetterOrUpdater } from "recoil";

// @ts-ignore
// prettier-ignore
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

let frame = 0;
let handFrame = 0;

export type PosenetConfigType = {
  arch: "MobileNetV1" | "ResNet50";
  skipSize: number;
  confidence: number;
  quantBytes?: PoseNetQuantBytes;
};

export type HandposeConfigType = {
  modelType: "full" | "lite";
  skipSize: number;
};

export const machineConfig: { [index: string]: PosenetConfigType } = {
  slow: {
    arch: "MobileNetV1",
    skipSize: 5,
    confidence: 0.5,
  },
  decent: {
    arch: "MobileNetV1",
    skipSize: 2,
    confidence: 0.7,
  },
  fast: {
    arch: "ResNet50",
    skipSize: 5,
    confidence: 0.9,
    quantBytes: 2,
  },
  beast: {
    arch: "ResNet50",
    skipSize: 2,
    confidence: 0.9,
    quantBytes: 2,
  },
};

export const machineConfigHands: { [index: string]: HandposeConfigType } = {
  slow: {
    modelType: "lite",
    skipSize: 5,
  },
  decent: {
    modelType: "lite",
    skipSize: 2,
  },
  fast: {
    modelType: "full",
    skipSize: 5,
  },
  beast: {
    modelType: "full",
    skipSize: 2,
  },
};

export async function initBodyTracking(
  machineType: MachineType,
  video: HTMLVideoElement,
  setKeypoints: (kps: Keypoints) => void,
  ratio: number
) {
  const config = machineConfig[machineType];
  let net: posenet.PoseNet;

  if (config.arch === "MobileNetV1") {
    // Faster model / less accurate
    net = await posenet.load({
      architecture: config.arch,
      inputResolution: { width: 320, height: 320 / ratio },
      outputStride: 16,
    });
  } else {
    // Better accuracy model / slower to load
    // inputResolution changes the image size before sending it to the model, making it faster
    net = await posenet.load({
      architecture: config.arch,
      outputStride: 32,
      inputResolution: { width: 320, height: 320 / ratio },
      quantBytes: config.quantBytes,
    });
  }

  detectPoseInRealTime(video, net, config, setKeypoints);
}

export async function initHandTracking(
  machineType: MachineType,
  video: HTMLVideoElement,
  setHandKeypoints: SetterOrUpdater<{
    Right: HandKeypoints;
    Left: HandKeypoints;
  }>
) {
  const config = machineConfigHands[machineType];

  const model = handpose.SupportedModels.MediaPipeHands;

  const detectorConfig: handpose.MediaPipeHandsMediaPipeModelConfig = {
    runtime: "mediapipe",
    solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands", // NOTE: What is this for? Will it break offline?
    modelType: config.modelType,
    maxHands: 2,
  };

  const detector = await handpose.createDetector(model, detectorConfig);
  handDetectionFrame(video, detector, config, setHandKeypoints);
}

export async function setupCamera(
  video: HTMLVideoElement
): Promise<HTMLVideoElement> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      "Browser API navigator.mediaDevices.getUserMedia not available"
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" },
    // NOTE: Lower resolution
    // video: { facingMode: "user", width: video.height, height: video.height }
  });

  // @ts-ignore
  video.srcObject = stream;

  return new Promise(
    (resolve) => (video.onloadedmetadata = () => resolve(video))
  );
}

async function poseDetectionFrame(
  video: HTMLVideoElement,
  net: posenet.PoseNet,
  flipPoseHorizontal: boolean,
  config: PosenetConfigType,
  setKeypoints: (kps: Keypoints) => void
) {
  // % executes the calculation every `skipSize` number of frames
  if (frame % config.skipSize === 0) {
    const pose = await net.estimateSinglePose(video, {
      flipHorizontal: flipPoseHorizontal,
      // scoreThreshold: 0.7
    });
    setKeypoints(pose.keypoints);
  }

  frame++;

  requestAnimationFrame(() =>
    poseDetectionFrame(video, net, flipPoseHorizontal, config, setKeypoints)
  );
}

function detectPoseInRealTime(
  video: HTMLVideoElement,
  net: posenet.PoseNet,
  config: PosenetConfigType,
  setKeypoints: (kps: Keypoints) => void
) {
  const flipPoseHorizontal = true;

  // Draw video pixels on canvas, draw keypoints, and set midi state
  poseDetectionFrame(video, net, flipPoseHorizontal, config, setKeypoints);
}

async function handDetectionFrame(
  video: HTMLVideoElement,
  detector: handpose.HandDetector,
  config: HandposeConfigType,
  setHandKeypoints: SetterOrUpdater<{
    Right: HandKeypoints;
    Left: HandKeypoints;
  }>
) {
  // % executes the calculation every `skipSize` number of frames
  if (handFrame % config.skipSize === 0) {
    const hands = await detector.estimateHands(video, { flipHorizontal: true });

    if (hands.length) {
      const left = hands.find((h) => h.handedness === "Left");
      const right = hands.find((h) => h.handedness === "Right");

      // NOTE: What if there's more than two hands?
      // NOTE: Keypoints3D seems to be more suitable for hands, at it doesn't take into consideration the position of the hand
      // TODO: Separate hand position for drawing from hand position for controls.
      setHandKeypoints({
        Left: left?.keypoints || [],
        Right: right?.keypoints || [],
      });
    }
  }

  handFrame++;

  requestAnimationFrame(() =>
    handDetectionFrame(video, detector, config, setHandKeypoints)
  );
}
