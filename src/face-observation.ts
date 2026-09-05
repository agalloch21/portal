import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { clamp, type FaceObservation } from './geometry';

export function faceObservation(result: FaceLandmarkerResult, width: number, height: number): FaceObservation | null {
  const points = result.faceLandmarks[0];
  if (!points) return null;
  const left = points[468] ?? points[33];
  const right = points[473] ?? points[263];
  const eyePixels = Math.hypot((left.x - right.x) * width, (left.y - right.y) * height);
  const matrix = result.facialTransformationMatrixes[0]?.data;
  const foreshortening = matrix ? clamp(Math.hypot(matrix[0], matrix[1]) / Math.hypot(matrix[0], matrix[1], matrix[2]), 0.55, 1) : 1;
  return { centerX: (left.x + right.x) * width / 2, centerY: (left.y + right.y) * height / 2, eyePixels, foreshortening, width, height };
}
