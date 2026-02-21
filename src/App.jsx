import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Plus,
  User,
  FileText,
  Briefcase,
  Play,
  ChevronRight,
  ShieldAlert,
  BarChart3,
  MessageSquare,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Mic,
  MicOff
} from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { analyzeResume, evaluateResponse, generateInitialQuestion } from './services/gemini';
import Markdown from 'react-markdown';
import * as pdfjsLib from 'pdfjs-dist';
import Webcam from 'react-webcam';
import { Camera } from 'lucide-react';

// Tell pdf.js where to find its worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- Components ---

const Card = ({ children, className, onClick }) => (
  <div
    className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden", className)}
    onClick={onClick}
  >
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  isLoading,
  type = 'button'
}) => {
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-brand-500 text-white hover:bg-brand-600",
    outline: "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700",
    ghost: "hover:bg-slate-100 text-slate-600",
    danger: "bg-red-500 text-white hover:bg-red-600"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

const Badge = ({ children, variant = 'default' }) => {
  const variants = {
    default: "bg-slate-100 text-slate-600",
    success: "bg-brand-100 text-brand-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700"
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState('login');
  const [interviews, setInterviews] = useState([]);
  const [loginData, setLoginData] = useState({ regNo: '', password: '' });
  const [signupData, setSignupData] = useState({
    name: '',
    regNo: '',
    password: '',
    email: '',
    dob: '',
    role: 'candidate',
    gender: '',
    education: '',
    skills: ''
  });
  const [activeInterview, setActiveInterview] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Expanded Form State matching requirements
  const [formData, setFormData] = useState({
    // User Data
    user_id: '',
    candidate_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'candidate',
    dob: '',
    gender: '',
    address: '',
    profile_photo: 'https://cdn-icons-png.flaticon.com/512/149/149071.png',

    // Resume & Job Details
    resume_text: '',
    education: '',
    manual_skills: '',
    job_role: '',
    job_description: '',

    // Interview Setup
    interview_mode: 'AI',
    interview_language: 'English',
    interview_duration: 30,
    interview_level: 'Intermediate',
    interview_date: new Date().toISOString().slice(0, 16)
  });

  const [currentQuestionId, setCurrentQuestionId] = useState(null);

  // Ask Multiple Questions States
  const [isQuestionsModalOpen, setIsQuestionsModalOpen] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  const handleAskSelectedQuestions = async () => {
    if (!activeInterview || selectedQuestions.length === 0) return;

    setIsQuestionsModalOpen(false);

    const combinedQuestion = "Please address the following questions:\n\n" + selectedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    const next_question_id = 'q_' + Math.random().toString(36).substring(7);

    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'interviewer',
      content: combinedQuestion,
      created_at: new Date().toISOString()
    }]);

    try {
      await fetch(`/api/interviews/${activeInterview.interview_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'interviewer',
          content: combinedQuestion,
          question_id: next_question_id
        })
      });
      setCurrentQuestionId(next_question_id);
      setSelectedQuestions([]);
    } catch (e) {
      console.error(e);
    }
  };


  // Voice Analysis States
  const [currentMessage, setCurrentMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionObj, setRecognitionObj] = useState(null);
  const [voiceMetrics, setVoiceMetrics] = useState(null);

  // Computer Vision Simulator State
  const [cvMetrics, setCvMetrics] = useState({
    attentionScore: 100,
    faceCount: 1,
    gazeStatus: 'Looking at screen',
    fraudRiskScore: 0,
    fraudAlert: false
  });

  useEffect(() => {
    fetchInterviews();
  }, []);

  useEffect(() => {
    let interval;
    if (view === 'session' && activeInterview) {
      interval = setInterval(() => {
        const rand = Math.random();
        let newFaceCount = 1;
        let newGaze = 'Looking at screen';
        let newAttention = Math.floor(80 + Math.random() * 20); // 80-100 normally

        let riskIncrease = 0;
        let isFraud = false;

        // Simulating 5% chance of looking away
        if (rand < 0.05) {
          newGaze = 'Looking away';
          newAttention = Math.floor(40 + Math.random() * 20);
          riskIncrease += 10;
        }
        // Simulating 1% chance of multiple faces
        if (rand > 0.99) {
          newFaceCount = 2;
          newAttention = 10;
          riskIncrease += 30;
        }

        setCvMetrics(prev => {
          const newRiskScore = Math.min(prev.fraudRiskScore + riskIncrease, 100);
          const shouldAlert = newRiskScore > 60;
          if (shouldAlert && !prev.fraudAlert) {
            console.warn("FRAUD RISK EXCEEDED SAFE THRESHOLDS");
          }
          return {
            ...prev,
            attentionScore: newAttention,
            faceCount: newFaceCount,
            gazeStatus: newGaze,
            fraudRiskScore: newRiskScore,
            fraudAlert: shouldAlert
          };
        });
      }, 3000);

      const handleFraudEvent = (reason, riskPoints) => {
        setCvMetrics(prev => {
          const newRiskScore = Math.min(prev.fraudRiskScore + riskPoints, 100);
          const shouldAlert = newRiskScore > 60;
          return {
            ...prev,
            fraudRiskScore: newRiskScore,
            fraudAlert: shouldAlert,
            gazeStatus: reason,
            attentionScore: 0
          };
        });
        alert(`🚨 CHEATING WARNING: ${reason}. Your action has been flagged by the AI Proctor.`);
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          handleFraudEvent('Tab Switched or Minimized', 20);
        }
      };

      const handleWindowBlur = () => {
        handleFraudEvent('Window Lost Focus', 15);
      };

      const handleWindowResize = () => {
        // Detecting split screen or un-maximizing
        if (window.outerWidth < window.screen.availWidth * 0.8 || window.outerHeight < window.screen.availHeight * 0.8) {
          handleFraudEvent('Split Screen / Resized', 25);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", handleWindowBlur);
      window.addEventListener("resize", handleWindowResize);

      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("blur", handleWindowBlur);
        window.removeEventListener("resize", handleWindowResize);
      };
    }
  }, [view, activeInterview]);

  useEffect(() => {
    if (cvMetrics.fraudRiskScore >= 100) {
      alert("🚨 MAXIMUM RISK SCORE REACHED. The interview will be terminated automatically and scores will be set to zero.");

      const terminateInterview = async () => {
        if (activeInterview) {
          try {
            await fetch(`/api/interviews/${activeInterview.interview_id}/finalize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isFraud: true })
            });
          } catch (e) {
            console.error("Failed to auto-finalize:", e);
          }
        }
        window.close();
      };

      terminateInterview();
    }
  }, [cvMetrics.fraudRiskScore, activeInterview]);

  const fetchInterviews = async () => {
    const res = await fetch('/api/interviews');
    const data = await res.json();
    setInterviews(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (data.success) {
        setFormData(prev => ({
          ...prev,
          user_id: data.user.user_id || prev.user_id,
          candidate_name: data.user.name || prev.candidate_name,
          email: data.user.email || prev.email,
          phone: data.user.phone || prev.phone,
          password: data.user.password || prev.password,
          dob: data.user.dob || prev.dob,
          gender: data.user.gender || prev.gender,
          role: data.user.role || prev.role,
          address: data.user.address || prev.address,
          education: data.user.education || prev.education,
          manual_skills: data.user.skills || prev.manual_skills
        }));
        setView('dashboard');
      } else {
        alert(data.error || "Login Failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error logging in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupData)
      });
      const data = await res.json();

      if (data.success) {
        setFormData(prev => ({
          ...prev,
          user_id: data.user.user_id || prev.user_id,
          candidate_name: data.user.name || signupData.name,
          email: data.user.email || signupData.email,
          password: data.user.password || signupData.password,
          dob: data.user.dob || signupData.dob,
          gender: data.user.gender || signupData.gender,
          role: data.user.role || signupData.role,
          education: data.user.education || signupData.education,
          manual_skills: data.user.skills || signupData.skills
        }));

        if (data.message.includes('Already registered')) {
          alert('Welcome back! ' + data.message);
        }

        setView('create');
      } else {
        alert(data.error || "Sign up Failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInterview = async () => {
    setIsLoading(true);
    try {
      const user_id = formData.user_id || ('u_' + Math.random().toString(36).substring(7));
      const resume_id = 'r_' + Math.random().toString(36).substring(7);
      const interview_id = 'i_' + Math.random().toString(36).substring(7);

      // 1. Create User
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id,
          name: formData.candidate_name,
          email: formData.email,
          phone: formData.phone,
          password_hash: formData.password, // In a real app, hash this frontend or backend
          role: formData.role,
          dob: formData.dob,
          gender: formData.gender,
          address: formData.address,
          profile_photo_path: formData.profile_photo
        })
      });

      // 2. Analyze resume (fetch base skills extraction)
      const resumeAnalysis = await analyzeResume(formData.resume_text, formData.job_description);

      // Explicitly override generic questions with our new strictly generated PDF questions if they exist!
      if (formData.generated_questions && formData.generated_questions.length > 0) {
        resumeAnalysis.resume_based_questions = formData.generated_questions.filter(q => q.type?.toLowerCase().includes('project')).map(q => q.question);
        resumeAnalysis.technical_questions = formData.generated_questions.filter(q => q.type?.toLowerCase().includes('technical')).map(q => q.question);
        resumeAnalysis.hr_questions = formData.generated_questions.filter(q => q.type?.toLowerCase().includes('hr')).map(q => q.question);
        resumeAnalysis.scenario_based_questions = formData.generated_questions.filter(q => q.type?.toLowerCase().includes('scenario')).map(q => q.question);
      }

      // 3. Create Resume record
      await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id,
          user_id,
          resume_text: formData.resume_text,
          extracted_skills: (resumeAnalysis.technical_skills.join(', ') + ', ' + formData.manual_skills).trim(', '),
          experience_years: resumeAnalysis.experience_years,
          education: formData.education || 'Extracted from Resume',
          analysis: resumeAnalysis
        })
      });

      // 4. Create interview
      await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id,
          user_id,
          job_role: formData.job_role,
          job_description: formData.job_description,
          interview_mode: formData.interview_mode,
          interview_language: formData.interview_language,
          interview_duration: formData.interview_duration,
          interview_level: formData.interview_level
        })
      });

      // 5. Start the interview with an initial question
      const initialQuestion = await generateInitialQuestion(resumeAnalysis, formData.job_description);
      const question_id = 'q_' + Math.random().toString(36).substring(7);
      setCurrentQuestionId(question_id);

      await fetch(`/api/interviews/${interview_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'interviewer',
          content: initialQuestion,
          question_id
        })
      });

      fetchInterviews();
      handleOpenInterview(interview_id);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInterview = async (id) => {
    const res = await fetch(`/api/interviews/${id}`);
    const data = await res.json();
    setActiveInterview(data);
    setMessages(data.messages.map((m) => ({
      ...m,
      evaluation: m.evaluation ? (typeof m.evaluation === 'string' ? JSON.parse(m.evaluation) : m.evaluation) : undefined
    })));
    setView('session');
  };

  const handleSendMessage = async (content, finalVoiceMetrics = null) => {
    if (!activeInterview) return;

    // 1. Add candidate message
    const response_id = 'resp_' + Math.random().toString(36).substring(7);
    const candidateMsg = {
      role: 'candidate',
      content,
      created_at: new Date().toISOString(),
      response_id,
      question_id: currentQuestionId
    };
    setMessages(prev => [...prev, { ...candidateMsg, id: Date.now() }]);

    setIsLoading(true);
    try {
      // 2. Evaluate response
      const history = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const lastInterviewerMsg = [...messages].reverse().find(m => m.role === 'interviewer');

      const evaluation = await evaluateResponse(
        lastInterviewerMsg?.content || "Tell me about yourself",
        content,
        activeInterview.resume_text + (activeInterview.analysis ? `\n\nAI Recommended Questions Base to Pick From: ${JSON.stringify(activeInterview.analysis)}` : ''),
        activeInterview.job_description,
        history,
        finalVoiceMetrics
      );

      // 3. Save candidate message with evaluation and IDs
      await fetch(`/api/interviews/${activeInterview.interview_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'candidate',
          content,
          evaluation,
          response_id,
          question_id: currentQuestionId
        })
      });

      // 4. Generate next question (if automated)
      if (activeInterview.interview_mode === 'AI') {
        const next_question_id = 'q_' + Math.random().toString(36).substring(7);
        const nextQuestion = evaluation.next_recommended_question;

        await fetch(`/api/interviews/${activeInterview.interview_id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'interviewer',
            content: nextQuestion,
            question_id: next_question_id
          })
        });

        setCurrentQuestionId(next_question_id);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: 'interviewer',
          content: nextQuestion,
          created_at: new Date().toISOString()
        }]);
      }

      // Refresh messages
      const res = await fetch(`/api/interviews/${activeInterview.interview_id}`);
      const data = await res.json();
      setMessages(data.messages.map((m) => ({
        ...m,
        evaluation: m.evaluation ? (typeof m.evaluation === 'string' ? JSON.parse(m.evaluation) : m.evaluation) : undefined
      })));

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeInterview = async () => {
    if (!activeInterview) return;
    setIsLoading(true);
    try {
      await fetch(`/api/interviews/${activeInterview.interview_id}/finalize`, {
        method: 'POST'
      });
      setView('dashboard');
      fetchInterviews();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      recognitionObj?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = formData.interview_language === "English" ? "en-US" : "en-US";

    let metrics = {
      startTime: Date.now(),
      firstWordTime: null,
      pauses: 0,
      lastWordTime: Date.now()
    };

    let finalTranscript = currentMessage;

    recognition.onstart = () => {
      setIsRecording(true);
      setVoiceMetrics(metrics);
    };

    recognition.onresult = (event) => {
      const now = Date.now();
      if (!metrics.firstWordTime) metrics.firstWordTime = now;

      const timeSinceLastWord = now - metrics.lastWordTime;
      if (timeSinceLastWord > 2000) {
        metrics.pauses += 1;
      }
      metrics.lastWordTime = now;

      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setCurrentMessage(finalTranscript + interimTranscript);
      setVoiceMetrics(metrics);
    };

    recognition.onerror = (event) => {
      console.error(event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setRecognitionObj(recognition);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header - Only display when not in login or signup views */}
      {view !== 'login' && view !== 'signup' && (
        <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <ShieldAlert className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">InterviewIQ</h1>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Core Intelligence Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setView('dashboard')} className={cn(view === 'dashboard' && "bg-slate-100")}>
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <Button variant="primary" onClick={() => setView('create')}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Interview</span>
            </Button>
            <Button variant="outline" onClick={() => setView('login')} className="text-red-600 hover:bg-red-50 hover:text-red-700">
              Logout
            </Button>
          </div>
        </header>
      )}

      <main className={cn(
        "flex-1 w-full",
        (view !== 'login' && view !== 'signup') ? "p-6 max-w-7xl mx-auto" : "flex items-center justify-center p-6"
      )}>
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <Card>
                <div className="p-8 space-y-8">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                      <ShieldAlert className="text-white w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight">Welcome Back</h2>
                    <p className="text-slate-500">Sign in to your InterviewIQ account</p>
                  </div>

                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Register Number</label>
                      <input
                        type="text"
                        placeholder="e.g. REG12345"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all uppercase"
                        value={loginData.regNo}
                        onChange={e => setLoginData({ ...loginData, regNo: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                        value={loginData.password}
                        onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                      />
                    </div>
                    <Button variant="primary" className="w-full py-3 mt-4" type="submit">
                      Sign In
                    </Button>
                  </form>
                  <p className="text-center text-sm text-slate-500 font-medium pt-2">
                    Don't have an account? <span className="text-brand-600 hover:text-brand-700 cursor-pointer" onClick={() => setView('signup')}>Sign up</span>
                  </p>
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'signup' && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl"
            >
              <Card>
                <div className="p-8 space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Create Account</h2>
                    <p className="text-slate-500">Join InterviewIQ today</p>
                  </div>

                  <form className="space-y-6" onSubmit={handleSignup}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
                        <input
                          type="text"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                          value={signupData.name}
                          onChange={e => setSignupData({ ...signupData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Register Number</label>
                        <input
                          type="text"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none uppercase"
                          value={signupData.regNo}
                          onChange={e => setSignupData({ ...signupData, regNo: e.target.value.toUpperCase() })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Email Address</label>
                        <input
                          type="email"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                          value={signupData.email}
                          onChange={e => setSignupData({ ...signupData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Password</label>
                        <input
                          type="password"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                          value={signupData.password}
                          onChange={e => setSignupData({ ...signupData, password: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Date of Birth</label>
                        <input
                          type="date"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={signupData.dob}
                          onChange={e => setSignupData({ ...signupData, dob: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Gender</label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none bg-white"
                          value={signupData.gender}
                          onChange={e => setSignupData({ ...signupData, gender: e.target.value })}
                        >
                          <option value="">Select</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Role</label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none bg-white"
                          value={signupData.role}
                          onChange={e => setSignupData({ ...signupData, role: e.target.value })}
                        >
                          <option value="candidate">Candidate</option>
                          <option value="recruiter">Recruiter</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Education Details</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. B.Tech Computer Science"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                          value={signupData.education}
                          onChange={e => setSignupData({ ...signupData, education: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Skills (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. React, Node.js, Python"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                          value={signupData.skills}
                          onChange={e => setSignupData({ ...signupData, skills: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button variant="primary" className="w-full py-3" type="submit">
                      Create Account
                    </Button>
                  </form>
                  <p className="text-center text-sm text-slate-500 font-medium">
                    Already have an account? <span className="text-brand-600 hover:text-brand-700 cursor-pointer" onClick={() => setView('login')}>Sign in</span>
                  </p>
                </div>
              </Card>
            </motion.div>
          )}
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Interviews</h2>
                  <p className="text-slate-500">Manage and monitor ongoing candidate assessments.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {interviews.map((interview) => (
                  <Card key={interview.interview_id} className="group hover:border-slate-400 transition-colors cursor-pointer" onClick={() => handleOpenInterview(interview.interview_id)}>
                    <div className="p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600">
                          <User className="w-6 h-6" />
                        </div>
                        <Badge variant={interview.status === 'completed' ? 'success' : 'warning'}>
                          {interview.status}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="font-bold text-xl">{interview.candidate_name}</h3>
                        <p className="text-slate-500 text-sm flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {interview.job_role || 'General Role'} • {interview.interview_mode} Mode
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(interview.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center text-slate-900 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                          View Session <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}

                {interviews.length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 rounded-3xl">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                      <MessageSquare className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">No interviews yet</h3>
                      <p className="text-slate-500">Create your first interview session to get started.</p>
                    </div>
                    <Button onClick={() => setView('create')}>
                      <Plus className="w-4 h-4" /> Create Interview
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <Card>
                <div className="p-8 space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Setup New Interview</h2>
                    <p className="text-slate-500">Configure the candidate profile and job requirements.</p>
                  </div>

                  <div className="space-y-6">
                    {/* User profile details omitted since they are generated automatically from auth */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Target Jab Role</label>
                      <input
                        type="text"
                        placeholder="e.g. Senior Frontend Engineer"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                        value={formData.job_role}
                        onChange={e => setFormData({ ...formData, job_role: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Mode</label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.interview_mode}
                          onChange={e => setFormData({ ...formData, interview_mode: e.target.value })}
                        >
                          <option value="AI">AI Mode</option>
                          <option value="Manual">Manual</option>
                          <option value="Hybrid">Hybrid</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Level</label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.interview_level}
                          onChange={e => setFormData({ ...formData, interview_level: e.target.value })}
                        >
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Expert">Expert</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Duration (min)</label>
                        <input
                          type="number"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.interview_duration}
                          onChange={e => setFormData({ ...formData, interview_duration: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                          <FileText className="w-4 h-4" /> Resume Content (Text Extraction)
                        </label>
                        <label className="cursor-pointer flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors">
                          <UploadCloud className="w-4 h-4" /> Import File (.txt, .pdf)
                          <input
                            type="file"
                            accept=".txt,.pdf"
                            className="hidden"
                            onChange={async (e) => {
                              try {
                                setIsLoading(true);
                                const file = e.target.files?.[0];
                                if (!file) return;

                                if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
                                  const formDataUpload = new FormData();
                                  formDataUpload.append("resume", file);

                                  const response = await fetch("/api/ai/generate-questions-from-resume", {
                                    method: "POST",
                                    body: formDataUpload,
                                  });

                                  if (!response.ok) {
                                    throw new Error("Failed to process resume via API");
                                  }

                                  const data = await response.json();

                                  // Use the returned data to populate the text area and candidate details
                                  setFormData(prev => ({
                                    ...prev,
                                    resume_text: data.rawText || "Parsed text unavailable",
                                    candidate_name: prev.candidate_name || data.candidate_name,
                                    interview_level: data.experience_level || prev.interview_level,
                                    // Save the generated questions for later injection
                                    generated_questions: data.questions
                                  }));
                                } else {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    setFormData(prev => ({ ...prev, resume_text: event.target.result }));
                                  };
                                  reader.readAsText(file);
                                }
                              } catch (err) {
                                console.error(err);
                                alert("Error reading file.");
                              } finally {
                                setIsLoading(false);
                              }
                            }}
                          />
                        </label>
                      </div>
                      <textarea
                        rows={4}
                        placeholder="Paste resume text or import a file here..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
                        value={formData.resume_text}
                        onChange={e => setFormData({ ...formData, resume_text: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" /> Job Description
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Paste job description here..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
                        value={formData.job_description}
                        onChange={e => setFormData({ ...formData, job_description: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => setView('dashboard')}>Cancel</Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={handleCreateInterview}
                      isLoading={isLoading}
                      disabled={!formData.candidate_name || !formData.resume_text || !formData.job_description}
                    >
                      Initialize Engine
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'session' && activeInterview && (
            <motion.div
              key="session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-[calc(100vh-10rem)] flex gap-6"
            >
              {/* Chat Area */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                <Card className="flex-1 flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" onClick={() => setView('dashboard')} className="p-2">
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                      <div>
                        <h3 className="font-bold">{activeInterview.candidate_name}</h3>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                          {activeInterview.interview_mode} Mode • {messages.length} Messages
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={activeInterview.status === 'completed' ? 'success' : 'warning'}>
                        {activeInterview.status === 'completed' ? 'Session Archived' : 'Live Session'}
                      </Badge>
                      {activeInterview.status !== 'completed' && (
                        <Button variant="danger" className="py-1 px-3 text-xs" onClick={handleFinalizeInterview} isLoading={isLoading}>
                          Finish Interview
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((msg, i) => (
                      <div key={i} className={cn(
                        "flex flex-col max-w-[85%]",
                        msg.role === 'interviewer' ? "mr-auto" : "ml-auto items-end"
                      )}>
                        <div className={cn(
                          "p-4 rounded-2xl text-sm leading-relaxed markdown-body",
                          msg.role === 'interviewer'
                            ? "bg-slate-100 text-slate-800 rounded-tl-none"
                            : "bg-slate-900 text-white rounded-tr-none"
                        )}>
                          <Markdown>{msg.content}</Markdown>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 font-mono">
                          {msg.role.toUpperCase()} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex items-center gap-2 text-slate-400 text-xs font-mono animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        ENGINE PROCESSING...
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-slate-100">
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (currentMessage.trim()) {
                          handleSendMessage(currentMessage, voiceMetrics);
                          setCurrentMessage('');
                          setVoiceMetrics(null);
                        }
                      }}
                    >
                      <Button
                        variant={isRecording ? "danger" : "outline"}
                        onClick={handleMicClick}
                        disabled={isLoading}
                        type="button"
                        className={isRecording ? "animate-pulse" : ""}
                      >
                        {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </Button>
                      <input
                        name="message"
                        type="text"
                        placeholder={activeInterview.mode === 'automated' ? "Type candidate's response..." : "Type your question or candidate response..."}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                        autoComplete="off"
                        disabled={isLoading}
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                      />
                      <Button variant="primary" disabled={isLoading} type="submit">
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </form>
                  </div>
                </Card>
              </div>

              {/* Intelligence Sidebar */}
              <div className="w-96 flex flex-col gap-4">

                {/* Webcam Box */}
                <Card className="p-0 overflow-hidden bg-slate-900 text-white relative flex flex-col items-center justify-center min-h-[160px]">
                  <Webcam audio={false} className="w-full h-full object-cover opacity-80 absolute inset-0" />

                  <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none z-10 w-full h-full">
                    <div className="flex items-center justify-between border-b border-white/20 pb-2 w-full">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-emerald-400" />
                        <h3 className="font-bold text-sm">Proctor AI</h3>
                      </div>
                      {cvMetrics.fraudAlert ? <Badge variant="danger">FLAGGED</Badge> : <Badge variant="success">SECURE</Badge>}
                    </div>

                    <div className="flex justify-between items-start text-[10px] font-mono mt-auto pt-2 w-full">
                      <div className="space-y-1">
                        <div className={cn("bg-black/50 px-1.5 py-0.5 rounded w-fit", cvMetrics.gazeStatus !== 'Looking at screen' ? "text-red-400" : "text-emerald-400")}>
                          STATUS: {cvMetrics.gazeStatus.toUpperCase()}
                        </div>
                        <div className={cn("bg-black/50 px-1.5 py-0.5 rounded w-fit", cvMetrics.attentionScore < 60 ? "text-red-400" : "text-emerald-400")}>
                          ATTENTION: {cvMetrics.attentionScore}%
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <div className={cn("bg-black/50 px-1.5 py-0.5 rounded h-fit", cvMetrics.faceCount > 1 ? "text-red-400" : "text-emerald-400")}>
                          FACES: {cvMetrics.faceCount}
                        </div>
                        <div className={cn("bg-black/50 px-1.5 py-0.5 rounded h-fit font-bold", cvMetrics.fraudRiskScore > 60 ? "text-red-500 animate-pulse" : cvMetrics.fraudRiskScore > 20 ? "text-amber-400" : "text-emerald-400")}>
                          RISK SCORE: {cvMetrics.fraudRiskScore}/100
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <BarChart3 className="w-5 h-5 text-slate-900" />
                    <h3 className="font-bold">Real-time Evaluation</h3>
                  </div>

                  {messages.filter(m => m.role === 'candidate' && m.evaluation).length > 0 ? (
                    <div className="space-y-6">
                      {(() => {
                        const lastEval = [...messages].reverse().find(m => m.role === 'candidate' && m.evaluation)?.evaluation;
                        if (!lastEval) return null;

                        return (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-slate-50 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Tech</p>
                                <p className="text-xl font-bold text-slate-900">{lastEval.scores.technical}/10</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Rel</p>
                                <p className="text-xl font-bold text-slate-900">{lastEval.scores.relevance}/10</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Comm</p>
                                <p className="text-xl font-bold text-slate-900">{lastEval.scores.communication}/10</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Sentiment</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="success">{lastEval.sentiment}</Badge>
                                {lastEval.tone_analysis && (
                                  <Badge variant="default">{lastEval.tone_analysis}</Badge>
                                )}
                                {lastEval.fluency_report && (
                                  <Badge variant="warning">{lastEval.fluency_report}</Badge>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-red-500" /> Fraud & Integrity
                              </p>
                              <div className="space-y-1">
                                {lastEval.red_flags.length > 0 ? (
                                  lastEval.red_flags.map((flag, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg border border-red-100">
                                      <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                                      <p className="text-[11px] text-red-700 leading-tight">{flag}</p>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center gap-2 p-2 bg-brand-50 rounded-lg border border-brand-100">
                                    <CheckCircle2 className="w-3 h-3 text-brand-600" />
                                    <p className="text-[11px] text-brand-700">No red flags detected</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Next Recommended Question</p>
                              <div className="p-3 bg-slate-900 text-white rounded-xl text-xs italic leading-relaxed">
                                "{lastEval.next_recommended_question}"
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="py-10 text-center space-y-2">
                      <Loader2 className="w-6 h-6 text-slate-200 mx-auto animate-spin" />
                      <p className="text-xs text-slate-400">Waiting for candidate response...</p>
                    </div>
                  )}
                </Card>

                <Card className="p-5 flex-1 overflow-y-auto space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <MessageSquare className="w-5 h-5 text-slate-900" />
                      <h3 className="font-bold">Generated Questions Bank</h3>
                    </div>
                    {activeInterview.analysis && (
                      <div className="space-y-4">
                        <Button
                          variant="outline"
                          className="w-full text-xs py-2"
                          onClick={() => {
                            setSelectedQuestions([]);
                            setIsQuestionsModalOpen(true);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" /> Ask Multiple Questions
                        </Button>
                        {['resume_based_questions', 'technical_questions', 'scenario_based_questions', 'hr_questions'].map((category) => {
                          const questions = activeInterview.analysis[category];
                          if (!questions || !questions.length) return null;
                          return (
                            <div key={category} className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{category.replace(/_/g, ' ')}</p>
                              <div className="space-y-2">
                                {questions.map((q, i) => (
                                  <div key={i} className="p-2 bg-brand-50 rounded-lg border border-brand-100">
                                    <p className="text-[10px] text-brand-800 font-medium leading-relaxed italic">
                                      "{q}"
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <FileText className="w-5 h-5 text-slate-900" />
                      <h3 className="font-bold">Resume Context</h3>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono leading-relaxed whitespace-pre-wrap">
                      {activeInterview.resume_text}
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {/* Multiple Questions Modal */}
          {isQuestionsModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Select Multiple Questions</h3>
                      <p className="text-xs text-slate-500">Pick the ones you want to ask the candidate.</p>
                    </div>
                  </div>
                  <button onClick={() => setIsQuestionsModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors">x</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {activeInterview?.analysis && ['resume_based_questions', 'technical_questions', 'scenario_based_questions', 'hr_questions'].map((category) => {
                    const questions = activeInterview.analysis[category];
                    if (!questions || !questions.length) return null;
                    return (
                      <div key={category} className="space-y-3">
                        <p className="text-xs font-bold text-slate-900 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-fit">
                          {category.replace(/_/g, ' ')}
                        </p>
                        <div className="space-y-2">
                          {questions.map((q, i) => {
                            const isSelected = selectedQuestions.includes(q);
                            return (
                              <div
                                key={i}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedQuestions(selectedQuestions.filter(sq => sq !== q));
                                  } else {
                                    setSelectedQuestions([...selectedQuestions, q]);
                                  }
                                }}
                                className={cn(
                                  "p-3 rounded-xl border transition-all cursor-pointer flex gap-3 items-start",
                                  isSelected ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                )}
                              >
                                <div className={cn(
                                  "w-5 h-5 rounded flex items-center justify-center shrink-0 border mt-0.5 transition-colors",
                                  isSelected ? "bg-brand-600 border-brand-600 text-white" : "border-slate-300 bg-white"
                                )}>
                                  {isSelected && <CheckCircle2 className="w-3 h-3" />}
                                </div>
                                <p className={cn("text-sm leading-relaxed", isSelected ? "text-brand-900 font-medium" : "text-slate-600")}>
                                  {q}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-white">
                  <p className="text-sm font-semibold text-slate-500">
                    {selectedQuestions.length} selected
                  </p>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setIsQuestionsModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" disabled={selectedQuestions.length === 0} onClick={handleAskSelectedQuestions}>
                      Ask {selectedQuestions.length} Questions
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
