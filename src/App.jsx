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
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { analyzeResume, evaluateResponse, generateInitialQuestion } from './services/gemini';
import Markdown from 'react-markdown';

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
  isLoading
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
  const [view, setView] = useState('dashboard');
  const [interviews, setInterviews] = useState([]);
  const [activeInterview, setActiveInterview] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Expanded Form State matching requirements
  const [formData, setFormData] = useState({
    // User Data
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

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    const res = await fetch('/api/interviews');
    const data = await res.json();
    setInterviews(data);
  };

  const handleCreateInterview = async () => {
    setIsLoading(true);
    try {
      const user_id = 'u_' + Math.random().toString(36).substring(7);
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

      // 2. Analyze resume
      const resumeAnalysis = await analyzeResume(formData.resume_text, formData.job_description);

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
          education: formData.education || 'Extracted from Resume'
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

  const handleSendMessage = async (content) => {
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
        activeInterview.resume_text,
        activeInterview.job_description,
        history
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 justify-between sticky top-0 z-10">
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
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
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
                  <Card key={interview.id} className="group hover:border-slate-400 transition-colors cursor-pointer" onClick={() => handleOpenInterview(interview.id)}>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Jane Doe"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                          value={formData.candidate_name}
                          onChange={e => setFormData({ ...formData, candidate_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Email ID</label>
                        <input
                          type="email"
                          placeholder="jane@example.com"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                          value={formData.email}
                          onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Phone</label>
                        <input
                          type="text"
                          placeholder="+1 234 567 890"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                          value={formData.phone}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Secure Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                          value={formData.password}
                          onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Date of Birth</label>
                        <input
                          type="date"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.dob}
                          onChange={e => setFormData({ ...formData, dob: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Gender</label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.gender}
                          onChange={e => setFormData({ ...formData, gender: e.target.value })}
                        >
                          <option value="">Select</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Address</label>
                        <input
                          type="text"
                          placeholder="City, Country"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.address}
                          onChange={e => setFormData({ ...formData, address: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Education Details</label>
                        <input
                          type="text"
                          placeholder="e.g. MS in CS, Stanford"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.education}
                          onChange={e => setFormData({ ...formData, education: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold uppercase tracking-wider text-slate-500">Manual Skills (Comma Separated)</label>
                        <input
                          type="text"
                          placeholder="e.g. React, Node.js, AWS"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none"
                          value={formData.manual_skills}
                          onChange={e => setFormData({ ...formData, manual_skills: e.target.value })}
                        />
                      </div>
                    </div>

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
                      <label className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Resume Content (Text Extraction)
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Paste resume text here..."
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
                        const input = e.currentTarget.elements.namedItem('message');
                        if (input.value.trim()) {
                          handleSendMessage(input.value);
                          input.value = '';
                        }
                      }}
                    >
                      <input
                        name="message"
                        type="text"
                        placeholder={activeInterview.mode === 'automated' ? "Type candidate's response..." : "Type your question or candidate response..."}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
                        autoComplete="off"
                        disabled={isLoading}
                      />
                      <Button variant="primary" disabled={isLoading}>
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </form>
                  </div>
                </Card>
              </div>

              {/* Intelligence Sidebar */}
              <div className="w-96 flex flex-col gap-4">
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
                              <div className="flex items-center gap-2">
                                <Badge variant="success">{lastEval.sentiment}</Badge>
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
                      <h3 className="font-bold">Probing Questions</h3>
                    </div>
                    <div className="space-y-3">
                      {activeInterview.analysis?.probing_questions?.map((q, i) => (
                        <div key={i} className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                          <p className="text-[11px] text-brand-800 font-medium leading-relaxed italic">
                            "{q}"
                          </p>
                        </div>
                      ))}
                    </div>
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
        </AnimatePresence>
      </main>
    </div>
  );
}
