import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/handpose';
import { Camera, Hand, ChevronDown, ChevronUp } from 'lucide-react';

const fingerJoints = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};

const connectedJointPairs = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [0, 5], [5, 9], [9, 13], [13, 17],
];

function App() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<handpose.HandPose | null>(null);
  const [prediction, setPrediction] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showInstructions, setShowInstructions] = useState(false);

  const letterInstructions = {
    'A': 'Make a fist with your thumb resting on the side of your fingers.',
    'B': 'Hold your hand up flat with fingers together and thumb tucked.',
    'C': 'Curve your hand in a C shape, with fingers together.',
    'D': 'Make "U" shape with fingers, then touch thumb to middle finger.',
    'E': 'Curl all fingers in, showing fingernails.',
    'F': 'Touch thumb to index finger, keep other fingers up.',
    'G': 'Point index finger to thumb, keeping hand horizontal.',
    'H': 'Keep index and middle fingers together and straight, others closed.',
    'I': 'Make a fist with pinky finger extended up.',
    'J': 'Start with "I" and trace a "J" in the air.',
    'K': 'Index and middle fingers up and spread, thumb to middle finger.',
    'L': 'Make "L" shape with thumb and index finger.',
    'M': 'Place thumb between last three fingers.',
    'N': 'Place thumb between last two fingers.',
    'O': 'Form an "O" shape with all fingers touching.',
    'P': 'Point index finger down with thumb out.',
    'Q': 'Point index finger down next to thumb.',
    'R': 'Cross index and middle fingers.',
    'S': 'Make a fist with thumb wrapped over fingers.',
    'T': 'Place thumb between index and middle fingers.',
    'U': 'Hold index and middle fingers up together.',
    'V': 'Hold index and middle fingers in a "V" shape.',
    'W': 'Hold index, middle, and ring fingers up spread apart.',
    'X': 'Make a fist with index finger bent in hook shape.',
    'Y': 'Extend thumb and pinky, other fingers closed.',
    'Z': 'Trace "Z" in air with index finger.'
  };

  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await handpose.load();
        setModel(loadedModel);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load the model. Please check your connection and try again.');
        setIsLoading(false);
      }
    };
    loadModel();
  }, []);

  const calculateAngle = (p1: number[], p2: number[], p3: number[]) => {
    if (!p1 || !p2 || !p3) return 0;
    
    const radians = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) -
                   Math.atan2(p1[1] - p2[1], p1[0] - p2[0]);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  };

  const getFingerState = (landmarks: number[][], finger: number[]) => {
    try {
      const points = finger.map(idx => landmarks[idx]);
      if (points.some(point => !point)) return false;
      
      const angle1 = calculateAngle(points[1], points[2], points[3]);
      const angle2 = calculateAngle(points[2], points[3], points[4]);
      return (angle1 < 130 || angle2 < 130);
    } catch (err) {
      console.error('Error in getFingerState:', err);
      return false;
    }
  };

  const getFingerHeight = (landmarks: number[][], fingerTip: number) => {
    try {
      if (!landmarks[0] || !landmarks[fingerTip]) return 0;
      const palmBase = landmarks[0][1];
      const tipHeight = landmarks[fingerTip][1];
      return palmBase - tipHeight;
    } catch (err) {
      console.error('Error in getFingerHeight:', err);
      return 0;
    }
  };

  const getFingerSpread = (landmarks: number[][], finger1: number, finger2: number) => {
    try {
      if (!landmarks[finger1] || !landmarks[finger2]) return 0;
      return Math.abs(landmarks[finger1][0] - landmarks[finger2][0]);
    } catch (err) {
      console.error('Error in getFingerSpread:', err);
      return 0;
    }
  };

  const processLandmarks = (landmarks: number[][]) => {
    try {
      if (!landmarks || landmarks.length === 0) return '?';

      // Get finger states (true if bent)
      const thumbBent = getFingerState(landmarks, fingerJoints.thumb);
      const indexBent = getFingerState(landmarks, fingerJoints.indexFinger);
      const middleBent = getFingerState(landmarks, fingerJoints.middleFinger);
      const ringBent = getFingerState(landmarks, fingerJoints.ringFinger);
      const pinkyBent = getFingerState(landmarks, fingerJoints.pinky);

      // Get finger heights relative to palm
      const thumbHeight = getFingerHeight(landmarks, 4);
      const indexHeight = getFingerHeight(landmarks, 8);
      const middleHeight = getFingerHeight(landmarks, 12);
      const ringHeight = getFingerHeight(landmarks, 16);
      const pinkyHeight = getFingerHeight(landmarks, 20);

      // Specific check for B - all fingers straight and together, thumb tucked
      const allFingersUpAndStraight = 
          !indexBent && !middleBent && !ringBent && !pinkyBent &&
          Math.abs(indexHeight) > 50 && 
          Math.abs(middleHeight) > 50 && 
          Math.abs(ringHeight) > 50 && 
          Math.abs(pinkyHeight) > 50;

      const fingersClose = 
          Math.abs(landmarks[8][0] - landmarks[12][0]) < 30 && // index to middle
          Math.abs(landmarks[12][0] - landmarks[16][0]) < 30 && // middle to ring
          Math.abs(landmarks[16][0] - landmarks[20][0]) < 30;   // ring to pinky

      const thumbTucked = 
          thumbBent && 
          landmarks[4][0] < landmarks[0][0] && // thumb tip to the left of palm
          Math.abs(landmarks[4][1] - landmarks[0][1]) < 50;     // thumb close to palm height

      if (allFingersUpAndStraight && fingersClose && thumbTucked) {
          return 'B';
      }

      // A - Fist with thumb on side
      if (indexBent && middleBent && ringBent && pinkyBent && !thumbBent) {
        return 'A';
      }

      // C - Curved hand, fingers together
      if (!indexBent && !middleBent && !ringBent && !pinkyBent && 
          Math.abs(landmarks[8][0] - landmarks[12][0]) < 30) {
        return 'C';
      }

      // D - Index up, others curved
      if (!indexBent && middleBent && ringBent && pinkyBent) {
        return 'D';
      }

      // E - All fingers curved in
      if (indexBent && middleBent && ringBent && pinkyBent && thumbBent) {
        return 'E';
      }

      // F - Index and thumb touching, others straight
      if (!middleBent && !ringBent && !pinkyBent && 
          Math.abs(landmarks[4][0] - landmarks[8][0]) < 30) {
        return 'F';
      }

      // G - Index pointing to thumb
      if (!indexBent && middleBent && ringBent && pinkyBent) {
        return 'G';
      }

      // H - Index and middle straight, parallel
      if (!indexBent && !middleBent && ringBent && pinkyBent && 
          getFingerSpread(landmarks, 8, 12) < 30) {
        return 'H';
      }

      // I - Pinky up
      if (indexBent && middleBent && ringBent && !pinkyBent && pinkyHeight > 40) {
        return 'I';
      }

      // K - Index and middle up, spread
      if (!indexBent && !middleBent && ringBent && pinkyBent && 
          getFingerSpread(landmarks, 8, 12) > 30) {
        return 'K';
      }

      // L - L-shape with thumb and index
      if (!indexBent && middleBent && ringBent && pinkyBent && !thumbBent && 
          Math.abs(landmarks[4][1] - landmarks[8][1]) > 40) {
        return 'L';
      }

      // M - Three fingers over thumb
      if (indexBent && middleBent && ringBent && 
          Math.abs(landmarks[4][1] - landmarks[8][1]) < 30) {
        return 'M';
      }

      // N - Two fingers over thumb
      if (indexBent && middleBent && !ringBent && 
          Math.abs(landmarks[4][1] - landmarks[8][1]) < 30) {
        return 'N';
      }

      // O - Fingers curved to touch thumb
      if (Math.abs(landmarks[4][0] - landmarks[8][0]) < 30 && 
          Math.abs(landmarks[4][1] - landmarks[8][1]) < 30) {
        return 'O';
      }

      // P - Index pointing down, thumb out
      if (!indexBent && middleBent && ringBent && pinkyBent && 
          landmarks[8][1] > landmarks[0][1]) {
        return 'P';
      }

      // R - Crossed fingers
      if (!indexBent && !middleBent && ringBent && pinkyBent && 
          Math.abs(landmarks[8][0] - landmarks[12][0]) < 25) {
        return 'R';
      }

      // S - Fist with thumb in front
      if (indexBent && middleBent && ringBent && pinkyBent && 
          landmarks[4][2] < landmarks[0][2]) {
        return 'S';
      }

      // T - Thumb between index and middle
      if (indexBent && !middleBent && ringBent && pinkyBent && 
          Math.abs(landmarks[4][0] - landmarks[6][0]) < 30) {
        return 'T';
      }

      // U - Index and middle parallel
      if (!indexBent && !middleBent && ringBent && pinkyBent && 
          getFingerSpread(landmarks, 8, 12) < 30) {
        return 'U';
      }

      // V - Index and middle spread
      if (!indexBent && !middleBent && ringBent && pinkyBent && 
          getFingerSpread(landmarks, 8, 12) > 30) {
        return 'V';
      }

      // W - Three fingers spread
      if (!indexBent && !middleBent && !ringBent && pinkyBent && 
          getFingerSpread(landmarks, 8, 12) > 30 && 
          getFingerSpread(landmarks, 12, 16) > 30) {
        return 'W';
      }

      // Y - Thumb and pinky out
      if (indexBent && middleBent && ringBent && !pinkyBent && !thumbBent && 
          pinkyHeight > 40) {
        return 'Y';
      }

      return '?';
    } catch (err) {
      console.error('Error in processLandmarks:', err);
      return '?';
    }
  };

  const drawHand = (landmarks: number[][]) => {
    try {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      landmarks.forEach((point) => {
        if (!point) return;
        ctx.beginPath();
        ctx.arc(point[0], point[1], 5, 0, 3 * Math.PI);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
      });

      connectedJointPairs.forEach(([start, end]) => {
        if (!landmarks[start] || !landmarks[end]) return;
        ctx.beginPath();
        ctx.moveTo(landmarks[start][0], landmarks[start][1]);
        ctx.lineTo(landmarks[end][0], landmarks[end][1]);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    } catch (err) {
      console.error('Error in drawHand:', err);
    }
  };

  const detect = async () => {
    if (!model || !webcamRef.current) return;

    const webcam = webcamRef.current.video;
    if (!webcam || webcam.readyState !== 4) return;

    try {
      const predictions = await model.estimateHands(webcam);
      
      if (predictions.length > 0) {
        const landmarks = predictions[0].landmarks;
        const gesture = processLandmarks(landmarks);
        setPrediction(gesture);

        const canvas = canvasRef.current;
        if (canvas) {
          const scaledLandmarks = landmarks.map(point => [
            point[0] * (canvas.width / webcam.videoWidth),
            point[1] * (canvas.height / webcam.videoHeight),
            point[2]
          ]);
          drawHand(scaledLandmarks);
        }
      } else {
        setPrediction('');
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    } catch (err) {
      console.error('Error during detection:', err);
      // Don't set error state here to avoid UI disruption
      // Just log the error and continue
    }
  };

  useEffect(() => {
    if (model) {
      const interval = setInterval(() => {
        detect();
      }, 100);
      return () => clearInterval(interval);
    }
  }, [model]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: "user"
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-red-500 flex items-center justify-center mb-4">
            <Hand className="w-12 h-12" />
          </div>
          <h2 className="text-xl font-bold text-center text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="animate-pulse flex flex-col items-center">
            <Hand className="w-12 h-12 text-blue-500 mb-4" />
            <h2 className="text-xl font-bold text-gray-700 mb-4">Loading Model...</h2>
            <div className="w-full h-2 bg-blue-200 rounded">
              <div className="w-1/2 h-full bg-blue-500 rounded animate-[loading_1s_ease-in-out_infinite]"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-blue-500 to-purple-600">
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Hand className="w-8 h-8" />
              ASL Alphabet Translator
            </h1>
          </div>
          
          <div className="p-6">
            <div className="relative">
              <Webcam
                ref={webcamRef}
                audio={false}
                videoConstraints={videoConstraints}
                className="w-full rounded-lg shadow-lg"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
                width={videoConstraints.width}
                height={videoConstraints.height}
              />
              <div className="absolute top-4 right-4 bg-black bg-opacity-50 rounded-full p-2">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Detected ASL Letter</h2>
              <div className="flex items-center justify-center h-24 bg-white rounded-lg shadow-inner">
                <span className="text-4xl font-bold text-blue-600">
                  {prediction || 'No sign detected'}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                className="w-full flex items-center justify-between p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-800">ASL Alphabet Guide</h3>
                {showInstructions ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>
              
              {showInstructions && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => (
                    <div key={letter} className="p-4 bg-white rounded-lg shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl font-bold text-blue-600">{letter}</span>
                        <p className="text-sm text-gray-600 flex-1">
                          {letterInstructions[letter]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-gray-600">
                Note: Letters J and Z require motion and may not be accurately detected.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;