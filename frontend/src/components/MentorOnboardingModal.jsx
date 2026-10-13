import { useState, useEffect, useRef, useCallback } from "react";
import { getMentorProfile, updateMentorProfile, deleteMentorProfile } from "../api/mentor";
import { MENTOR_NAME } from "../constants/mentor";

export default function MentorOnboardingModal({ isOpen, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [loading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [status, setStatus] = useState("intern");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [monthlySavingsTarget, setMonthlySavingsTarget] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [goalSaved, setGoalSaved] = useState("0");
  const [riskComfort, setRiskComfort] = useState("medium");
  const [language, setLanguage] = useState("en");
  const [consent, setConsent] = useState(false);

  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleSkip = useCallback(() => {
    localStorage.setItem("settl_mentor_onboarding_dismissed", "true");
    onCloseRef.current?.();
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      getMentorProfile()
        .then((p) => {
          if (isMounted && p) {
            setStatus(p.status || "intern");
            setMonthlyIncome(p.monthlyIncome ? String(p.monthlyIncome) : "");
            setMonthlySavingsTarget(p.monthlySavingsTarget ? String(p.monthlySavingsTarget) : "");
            setRiskComfort(p.riskComfort || "medium");
            setLanguage(p.language || "en");
            setConsent(Boolean(p.consentToUseForMentor));
            if (p.goals && p.goals.length > 0) {
              const g = p.goals[0];
              setGoalName(g.name || "");
              setGoalAmount(g.targetAmount ? String(g.targetAmount) : "");
              setGoalSaved(g.savedSoFar !== undefined ? String(g.savedSoFar) : "0");
              if (g.deadline) {
                setGoalDeadline(new Date(g.deadline).toISOString().split("T")[0]);
              }
            }
          }
        })
        .catch((err) => console.error("Error loading profile:", err));

      // Focus trap and Escape listener
      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          handleSkip();
        } else if (e.key === "Tab" && modalRef.current) {
          const focusables = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      setTimeout(() => {
        const firstInput = modalRef.current?.querySelector("input, button, select");
        firstInput?.focus();
      }, 50);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, handleSkip]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const goalsPayload = [];
      if (goalName.trim() && goalAmount && goalDeadline) {
        const parsedGoalAmt = Math.max(1, Math.min(100000000, Number(goalAmount)));
        const parsedSaved = Math.max(0, Math.min(100000000, Number(goalSaved || 0)));
        goalsPayload.push({
          name: goalName.trim(),
          targetAmount: parsedGoalAmt,
          deadline: new Date(goalDeadline).toISOString(),
          savedSoFar: parsedSaved,
        });
      }

      const parsedIncome = monthlyIncome ? Math.max(0, Math.min(100000000, Number(monthlyIncome))) : null;
      const parsedSavingsTarget = monthlySavingsTarget ? Math.max(0, Math.min(100000000, Number(monthlySavingsTarget))) : null;

      const payload = {
        status,
        monthlyIncome: parsedIncome,
        monthlySavingsTarget: parsedSavingsTarget,
        goals: goalsPayload,
        riskComfort,
        language,
        consentToUseForMentor: consent,
      };

      await updateMentorProfile(payload);
      localStorage.setItem("settl_mentor_onboarding_dismissed", "true");
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save profile. Please check your inputs.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!window.confirm("Are you sure you want to delete your profile data? This will clear your income, savings target, and goals.")) {
      return;
    }

    setDeleting(true);
    setError("");
    setSuccessMsg("");
    try {
      await deleteMentorProfile();
      setStatus("intern");
      setMonthlyIncome("");
      setMonthlySavingsTarget("");
      setGoalName("");
      setGoalAmount("");
      setGoalDeadline("");
      setGoalSaved("0");
      setConsent(false);
      setSuccessMsg("Your profile data has been deleted from Settl.");
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete profile data.");
    } finally {
      setDeleting(false);
    }
  };

  const blockInvalidNumericInput = (e) => {
    if (["e", "E", "+", "-"].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mentor-onboarding-title"
        className="glass-card w-full max-w-lg rounded-3xl border border-white/10 p-6 shadow-2xl flex flex-col gap-5 relative overflow-hidden bg-zinc-900/90 text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-2xl">auto_awesome</span>
            </div>
            <div>
              <h3 id="mentor-onboarding-title" className="font-extrabold text-base text-white">Personalize {MENTOR_NAME}</h3>
              <p className="text-xs text-zinc-400 font-medium">Customize your financial guidance profile</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-white text-xs uppercase tracking-wider font-bold p-2 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-2.5 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-medium">
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-3 text-zinc-400">
            <span className="material-symbols-outlined animate-spin text-2xl text-blue-400">sync</span>
            <p className="text-xs font-semibold">Loading your profile...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-xs">
            {/* Step Indicators */}
            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setStep(num)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    step === num
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                      : "bg-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  {num === 1 ? "1. Consent & Role" : num === 2 ? "2. Budget & Goals" : "3. Preferences"}
                </button>
              ))}
            </div>

            {/* Step 1: Consent & Status */}
            {step === 1 && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      id="mentor-consent-checkbox"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 rounded border-zinc-700 text-blue-500 focus:ring-blue-500 h-4 w-4 bg-zinc-800 cursor-pointer"
                    />
                    <label htmlFor="mentor-consent-checkbox" className="text-xs cursor-pointer">
                      <span className="font-extrabold text-white block">Enable Profile &amp; Data Mentoring Consent</span>
                      <span className="text-zinc-300 block mt-1 leading-relaxed text-[11px]">
                        When enabled, your profile data (income, savings target, goals, preferences) and relevant Settl group finances are sent to <strong>Google&apos;s Gemini AI service</strong> to generate personalized answers. Your data is <strong>never used or sent unless consent is checked</strong>, and you can turn consent off at any time. When consent is turned off, your stored profile data is kept securely in Settl but is never sent to Gemini.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mentor-status-select" className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">
                    Employment / Life Status
                  </label>
                  <select
                    id="mentor-status-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="student">Student</option>
                    <option value="intern">Intern</option>
                    <option value="job">Employed / Job</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Delete Profile Data Button */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">Want to wipe all profile inputs from Settl?</span>
                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete my profile data"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Income, Savings & Goals */}
            {step === 2 && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="mentor-income-input" className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">
                      Monthly Income / Allowance (₹)
                    </label>
                    <input
                      id="mentor-income-input"
                      type="number"
                      min="0"
                      max="100000000"
                      step="1"
                      placeholder="e.g. 20000"
                      value={monthlyIncome}
                      onKeyDown={blockInvalidNumericInput}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="mentor-savings-target-input" className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">
                      Monthly Savings Target (₹)
                    </label>
                    <input
                      id="mentor-savings-target-input"
                      type="number"
                      min="0"
                      max="100000000"
                      step="1"
                      placeholder="e.g. 5000"
                      value={monthlySavingsTarget}
                      onKeyDown={blockInvalidNumericInput}
                      onChange={(e) => setMonthlySavingsTarget(e.target.value)}
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3 flex flex-col gap-3">
                  <p className="font-extrabold text-white text-xs uppercase tracking-wider">Primary Financial Goal</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="mentor-goal-name-input" className="text-[10px] text-zinc-400 font-semibold">Goal Name</label>
                      <input
                        id="mentor-goal-name-input"
                        type="text"
                        placeholder="e.g. Laptop, Trip"
                        value={goalName}
                        onChange={(e) => setGoalName(e.target.value)}
                        className="bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="mentor-goal-amount-input" className="text-[10px] text-zinc-400 font-semibold">Target Amount (₹)</label>
                      <input
                        id="mentor-goal-amount-input"
                        type="number"
                        min="1"
                        max="100000000"
                        step="1"
                        placeholder="e.g. 30000"
                        value={goalAmount}
                        onKeyDown={blockInvalidNumericInput}
                        onChange={(e) => setGoalAmount(e.target.value)}
                        className="bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="mentor-goal-deadline-input" className="text-[10px] text-zinc-400 font-semibold">Target Deadline</label>
                      <input
                        id="mentor-goal-deadline-input"
                        type="date"
                        value={goalDeadline}
                        onChange={(e) => setGoalDeadline(e.target.value)}
                        className="bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="mentor-goal-saved-input" className="text-[10px] text-zinc-400 font-semibold">Saved So Far (₹)</label>
                      <input
                        id="mentor-goal-saved-input"
                        type="number"
                        min="0"
                        max="100000000"
                        step="1"
                        placeholder="0"
                        value={goalSaved}
                        onKeyDown={blockInvalidNumericInput}
                        onChange={(e) => setGoalSaved(e.target.value)}
                        className="bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Preferences */}
            {step === 3 && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mentor-risk-select" className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">Risk Comfort Level</label>
                  <select
                    id="mentor-risk-select"
                    value={riskComfort}
                    onChange={(e) => setRiskComfort(e.target.value)}
                    className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="low">Low (Conservative / FDs / Savings focus)</option>
                    <option value="medium">Medium (Balanced / Index Funds / Moderate risk)</option>
                    <option value="high">High (Growth / Equity SIPs / Long-term)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mentor-lang-select" className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">Language Preference</label>
                  <select
                    id="mentor-lang-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="en">English</option>
                    <option value="hinglish">Hinglish (Conversational Latin-script Hindi + English)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Educational Disclaimer */}
            <div className="mt-1 p-3 bg-zinc-800/50 border border-white/5 rounded-xl text-[10px] text-zinc-400 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-sm">info</span>
              <span>{MENTOR_NAME} provides general financial education and guidance, not licensed investment advice.</span>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleSkip}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 hover:text-white font-extrabold uppercase tracking-wider transition-all cursor-pointer"
              >
                Skip for Now
              </button>

              <div className="flex items-center gap-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-all cursor-pointer"
                  >
                    Back
                  </button>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Next &rarr;
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {saving && <span className="material-symbols-outlined animate-spin text-sm">sync</span>}
                    Save &amp; Start
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
