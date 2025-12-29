
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
          width: { ideal: 1920 },
          height: { ideal: 1080 }
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
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
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

  // Run identity verification using gemini-3-pro-preview for complex reasoning tasks
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
          // Add thinking budget to reserve tokens for high-quality reasoning in complex tasks
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
      
      // Access the .text property directly as per GenAI coding guidelines
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
    <div className="min-h-screen flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="p-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Manoj App <span className="text-indigo-400">Verify</span></h1>
        </div>
        {step !== 'welcome' && step !== 'processing' && step !== 'result' && (
          <button onClick={reset} className="text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-2xl mx-auto w-full">
        
        {step === 'welcome' && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full"></div>
                <UserCheck size={80} className="text-indigo-500 relative" />
              </div>
            </div>
            <h2 className="text-3xl font-extrabold mb-4">Identity Verification</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto leading-relaxed text-lg">
              Securely verify your identity by capturing your ID and a selfie.
            </p>
            <div className="space-y-4 text-left max-w-xs mx-auto mb-10">
              <div className="flex items-start gap-4 p-3 bg-slate-900/50 rounded-2xl border border-white/5">
                <div className="bg-slate-800 p-2 rounded-lg"><IdCard size={20} className="text-indigo-400" /></div>
                <div>
                  <p className="font-semibold">1. Scan ID Card</p>
                  <p className="text-xs text-slate-500">Center your document in frame</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 bg-slate-900/50 rounded-2xl border border-white/5">
                <div className="bg-slate-800 p-2 rounded-lg"><Camera size={20} className="text-indigo-400" /></div>
                <div>
                  <p className="font-semibold">2. Live Selfie</p>
                  <p className="text-xs text-slate-500">Ensure your face is well-lit</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setStep('capture_id')}
              className="group bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-3 mx-auto"
            >
              Start Verification
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {(step === 'capture_id' || step === 'capture_selfie') && (
          <div className="w-full flex flex-col gap-6">
            <div className="relative w-full aspect-[4/5] bg-black rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
              />
              
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {step === 'capture_id' ? (
                  <div className="w-[85%] aspect-[1.58/1] border-2 border-indigo-500/50 rounded-2xl shadow-[0_0_0_1000px_rgba(2,6,23,0.75)]">
                     <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-xl -mt-1 -ml-1 opacity-80" />
                     <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-xl -mt-1 -mr-1 opacity-80" />
                     <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-xl -mb-1 -ml-1 opacity-80" />
                     <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-xl -mb-1 -mr-1 opacity-80" />
                  </div>
                ) : (
                  <div className="relative w-[65%] aspect-[3/4] rounded-[120px] shadow-[0_0_0_1000px_rgba(2,6,23,0.75)] flex flex-col items-center justify-center">
                    {/* SVG Frame Guide */}
                    <svg className="absolute inset-0 w-full h-full text-indigo-400/40" viewBox="0 0 100 100" preserveAspectRatio="none">
                       <ellipse cx="50" cy="50" rx="49" ry="49" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                    </svg>
                    
                    {/* Alignment Brackets */}
                    <div className="absolute top-2 w-12 h-4 border-t-2 border-x-2 border-indigo-400/80 rounded-t-full" />
                    <div className="absolute bottom-2 w-16 h-4 border-b-2 border-x-2 border-indigo-400/80 rounded-b-full" />
                    
                    {/* Scan Line */}
                    <div className="absolute w-[90%] h-0.5 bg-indigo-500/60 shadow-[0_0_8px_2px_rgba(99,102,241,0.6)] animate-scan" />
                    
                    {/* Help Labels */}
                    <span className="absolute -top-10 text-[10px] uppercase tracking-widest text-indigo-400/60 font-bold">Top of head</span>
                    <span className="absolute -bottom-10 text-[10px] uppercase tracking-widest text-indigo-400/60 font-bold">Chin here</span>
                  </div>
                )}
              </div>

              <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6">
                {hasMultipleCameras && (
                  <button 
                    onClick={flipCamera}
                    className="w-12 h-12 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-slate-800 transition-all"
                  >
                    <RotateCw size={20} className="text-white" />
                  </button>
                )}
                
                <button 
                  onClick={captureImage}
                  className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl z-10"
                >
                  <div className="w-12 h-12 rounded-full bg-white"></div>
                </button>
                
                {hasMultipleCameras && <div className="w-12" />}
              </div>
            </div>
            <div className="text-center px-4 animate-in fade-in delay-300">
              <div className="flex items-center justify-center gap-2 mb-1">
                 <ScanText size={16} className="text-indigo-400" />
                 <p className="text-slate-200 font-semibold text-lg">
                  {step === 'capture_id' ? 'ID Verification' : 'Biometric Match'}
                </p>
              </div>
              <p className="text-slate-400 text-sm">
                {step === 'capture_id' ? 'Align your ID within the brackets' : 'Look directly into the frame'}
              </p>
            </div>
          </div>
        )}

        {(step === 'review_id' || step === 'review_selfie') && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-2xl font-bold mb-6 text-center">Review Photo</h3>
            <div className="relative aspect-video rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl mb-8">
              <img src={step === 'review_id' ? idImage! : selfieImage!} className="w-full h-full object-cover" alt="Captured" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setStep(step === 'review_id' ? 'capture_id' : 'capture_selfie')}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-semibold transition-colors text-slate-300"
              >
                <RefreshCw size={18} /> Retake
              </button>
              <button 
                onClick={() => step === 'review_id' ? setStep('capture_selfie') : runVerification()}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                Continue <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="relative mb-10">
              <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 animate-pulse"></div>
              <Loader2 size={64} className="text-indigo-500 animate-spin relative" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Verifying Identity</h2>
            <p className="text-slate-400">AI is comparing features and document security...</p>
          </div>
        )}

        {step === 'result' && (
          <div className="w-full animate-in zoom-in-95">
            <div className={`p-8 rounded-[40px] border ${result?.isMatch ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'} mb-8 shadow-2xl`}>
              <div className="flex justify-center mb-6">
                {result?.isMatch ? (
                  <div className="bg-emerald-500 p-4 rounded-full shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 size={48} className="text-white" />
                  </div>
                ) : (
                  <div className="bg-rose-500 p-4 rounded-full shadow-lg shadow-rose-500/30">
                    <XCircle size={48} className="text-white" />
                  </div>
                )}
              </div>
              
              <h2 className="text-2xl font-extrabold text-center mb-2">
                {error ? 'System Error' : (result?.isMatch ? 'Verification Passed' : 'Verification Failed')}
              </h2>
              
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 mt-6">
                <p className="text-slate-300 text-sm leading-relaxed text-center italic">
                  "{error || result?.reasoning}"
                </p>
              </div>
            </div>
            <button 
              onClick={reset}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
            >
              New Verification
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
