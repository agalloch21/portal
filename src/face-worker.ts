import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { faceObservation } from './face-observation';

let detector: FaceLandmarker | null = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(data.wasmUrl);
      detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.modelUrl, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
    }
  } else if (data.type === 'frame') {
    const bitmap = data.bitmap as ImageBitmap;
    try {
      const result = detector?.detectForVideo(bitmap, data.timestamp);
      self.postMessage({ type: 'result', timestamp: data.timestamp, face: result ? faceObservation(result, bitmap.width, bitmap.height) : null });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
    } finally { bitmap.close(); }
  }
};
