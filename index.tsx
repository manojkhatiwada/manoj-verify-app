
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  Camera, 
  UserCheck, 
  IdCard, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RefreshCw, 
  ShieldCheck,
  Loader2,
  RotateCw,
  ScanText
} from 'lucide-react';

// --- Types ---

type AppStep = 'welcome' | 'capture_id' | 'review_id' | 'capture_selfie' | 'review_selfie' | 'processing' | 'result';

interface VerificationResult {
  isMatch: boolean;
  confidence: number;
  reasoning: string;
}

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('welcome');
  const [idImage, setIdImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (err) {
        console.error("Error checking for cameras", err);
      }
    };
    checkCameras();
  }, []);

  const startCamera = async (currentFacingMode?: 'user' | 'environment') => {
    stopCamera();
    try {
      const mode = currentFacingMode || facingMode;
      const constraints: MediaStreamConstraints = { 
        video: { 
          facingMode: { ideal: mode },
          width: { ideal: 1280 }, // Lowering slightly for better compatibility/performance
          height: { ideal: 720 }
        }, 
        audio: false 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      } catch (fallbackErr) {
        setError('Could not access camera. Please ensure permissions are granted.');
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const flipCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        if (facingMode === 'user') {
          context.translate(canvasRef.current.width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(videoRef.current, 0, 0);
        context.setTransform(1, 0, 0, 1, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
        if (step === 'capture_id') {
          setIdImage(dataUrl);
          setStep('review_id');
        } else {
          setSelfieImage(dataUrl);
          setStep('review_selfie');
        }
        stopCamera();
      }
    }
  };

  const runVerification = async () => {
    if (!idImage || !selfieImage) return;
    setStep('processing');
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const idBase64 = idImage.split(',')[1];
      const selfieBase64 = selfieImage.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            { text: "You are a professional biometric identity verification system. Compare these two images. Image 1 is a Driver's License or Identity Document. Image 2 is a live selfie. Task: 1. Verify if the person in the selfie is the same person shown on the ID. 2. Verify if the ID document looks authentic and is not a picture of a screen. Return results in JSON format." },
            { inlineData: { mimeType: 'image/jpeg', data: idBase64 } },
            { inlineData: { mimeType: 'image/jpeg', data: selfieBase64 } }
          ]
        },
        config: {
          thinkingConfig: { thinkingBudget: 4000 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isMatch: { type: Type.BOOLEAN },
              confidence: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            },
            required: ['isMatch', 'confidence', 'reasoning']
          }
        }
      });
      
      const data = JSON.parse(response.text || '{}') as VerificationResult;
      setResult(data);
      setStep('result');
    } catch (err) {
      console.error(err);
      setError('The verification engine encountered an error. Please try again.');
      setStep('result');
    }
  };

  useEffect(() => {
    if (step === 'capture_id') {
      setFacingMode('environment');
      startCamera('environment');
    } else if (step === 'capture_selfie') {
      setFacingMode('user');
      startCamera('user');
    }
    return () => stopCamera();
  }, [step]);

  const reset = () => {
    setIdImage(null);
    setSelfieImage(null);
    setResult(null);
    setError(null);
    setStep('welcome');
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Manoj TrustID <span className="text-indigo-400">Verify</span></h1>
        </div>
        {step !== 'welcome' && step !== 'processing' && step !== 'result' && (
          <button onClick={reset} className="text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-xl mx-auto w-full">
        
        {step === 'welcome' && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 w-full">
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full"></div>
                <UserCheck size={64} className="text-indigo-500 relative" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">Identity Check</h2>
            <p className="text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
              Verify your identity in seconds using your document and a selfie.
            </p>
            <div className="space-y-3 text-left max-w-sm mx-auto mb-10">
              <div className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                <div className="bg-slate-800 p-2 rounded-lg"><IdCard size={18} className="text-indigo-400" /></div>
                <div>
                  <p className="font-semibold text-sm">Scan ID Card</p>
                  <p className="text-xs text-slate-500">Government issued document</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                <div className="bg-slate-800 p-2 rounded-lg"><Camera size={18} className="text-indigo-400" /></div>
                <div>
                  <p className="font-semibold text-sm">Live Selfie</p>
                  <p className="text-xs text-slate-500">3D Biometric facial scan</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setStep('capture_id')}
              className="group bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-3 mx-auto w-full sm:w-auto justify-center"
            >
              Start Verification
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {(step === 'capture_id' || step === 'capture_selfie') && (
          <div className="w-full flex flex-col gap-4 animate-in fade-in">
            <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] bg-black rounded-[32px] overflow-hidden shadow-2xl">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
              />
              
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {step === 'capture_id' ? (
                  <div className="w-[85%] aspect-[1.58/1] border-2 border-indigo-500/40 rounded-xl shadow-[0_0_0_1000px_rgba(2,6,23,0.75)]">
                     <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg -mt-1 -ml-1" />
                     <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg -mt-1 -mr-1" />
                     <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg -mb-1 -ml-1" />
                     <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg -mb-1 -mr-1" />
                  </div>
                ) : (
                  <div className="relative w-[70%] aspect-[3/4] rounded-[100px] shadow-[0_0_0_1000px_rgba(2,6,23,0.75)] flex flex-col items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full text-indigo-400/30" viewBox="0 0 100 100" preserveAspectRatio="none">
                       <ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
                    </svg>
                    <div className="absolute w-[80%] h-0.5 bg-indigo-500/60 shadow-[0_0_12px_2px_rgba(99,102,241,0.6)] animate-scan" />
                  </div>
                )}
              </div>

              <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-6">
                {hasMultipleCameras && (
                  <button 
                    onClick={flipCamera}
                    className="w-12 h-12 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 flex items-center justify-center"
                  >
                    <RotateCw size={18} className="text-white" />
                  </button>
                )}
                <button 
                  onClick={captureImage}
                  className="w-14 h-14 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform shadow-xl z-10"
                >
                  <div className="w-10 h-10 rounded-full bg-white"></div>
                </button>
                {hasMultipleCameras && <div className="w-12" />}
              </div>
            </div>
            <div className="text-center px-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                 <ScanText size={14} className="text-indigo-400" />
                 <p className="text-slate-200 font-bold">
                  {step === 'capture_id' ? 'Scan Document' : 'Face Verification'}
                </p>
              </div>
              <p className="text-slate-500 text-xs">
                {step === 'capture_id' ? 'Center your ID card in the box' : 'Align your face in the oval'}
              </p>
            </div>
          </div>
        )}

        {(step === 'review_id' || step === 'review_selfie') && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-6">
            <h3 className="text-xl font-bold text-center">Confirm Photo</h3>
            <div className="relative aspect-[3/4] sm:aspect-[4/5] rounded-[32px] overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
              <img src={step === 'review_id' ? idImage! : selfieImage!} className="w-full h-full object-cover" alt="Captured" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setStep(step === 'review_id' ? 'capture_id' : 'capture_selfie')}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-semibold transition-colors text-slate-300 text-sm"
              >
                <RefreshCw size={16} /> Retake
              </button>
              <button 
                onClick={() => step === 'review_id' ? setStep('capture_selfie') : runVerification()}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 text-sm"
              >
                Confirm <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-12 flex flex-col items-center w-full">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 animate-pulse"></div>
              <Loader2 size={48} className="text-indigo-500 animate-spin relative" />
            </div>
            <h2 className="text-xl font-bold mb-2">Analyzing Data</h2>
            <p className="text-slate-400 text-sm">Matching facial nodes with document credentials...</p>
          </div>
        )}

        {step === 'result' && (
          <div className="w-full animate-in zoom-in-95 flex flex-col gap-6">
            <div className={`p-8 rounded-[32px] border ${result?.isMatch ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'} shadow-2xl`}>
              <div className="flex justify-center mb-6">
                {result?.isMatch ? (
                  <div className="bg-emerald-500 p-3 rounded-full shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 size={32} className="text-white" />
                  </div>
                ) : (
                  <div className="bg-rose-500 p-3 rounded-full shadow-lg shadow-rose-500/30">
                    <XCircle size={32} className="text-white" />
                  </div>
                )}
              </div>
              
              <h2 className="text-xl font-extrabold text-center mb-1">
                {error ? 'Verification Error' : (result?.isMatch ? 'Access Granted' : 'Access Denied')}
              </h2>
              
              <div className="bg-slate-900/50 p-5 rounded-xl border border-white/5 mt-4">
                <p className="text-slate-400 text-xs leading-relaxed text-center italic">
                  {error || result?.reasoning}
                </p>
              </div>
            </div>
            <button 
              onClick={reset}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all"
            >
              Start New Scan
            </button>
          </div>
        )}

      </main>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
