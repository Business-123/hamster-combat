import React, { useEffect, useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import Friends from '../icons/Friends';
import { coinIcon } from '../images';
import { formatGhs } from '../utils/currency';
import {
  fetchReferrals, redeemReferral, ReferralInfo, GameState,
  fetchTasks, completeTask, Task,
  initializeTaskVerification, confirmTaskVerification,
} from '../api';

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
  accountEmail?: string | null;
};

const REDEEM_TASK_ID = 'redeem-code';
const VERIFY_EMAIL_KEY = 'hamster-kombat-task-verify-email';

const FriendsScreen: React.FC<Props> = ({ state, onStateChange, accountEmail = null }) => {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const redeemInputRef = React.useRef<HTMLInputElement | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Only used to prompt a guest (no account) for a receipt email before a
  // verified (paid) task's checkout — signed-in players use accountEmail.
  const [verifyTask, setVerifyTask] = useState<Task | null>(null);
  const [verifyEmail, setVerifyEmail] = useState(() => localStorage.getItem(VERIFY_EMAIL_KEY) || '');

  const load = () => {
    setLoading(true);
    fetchReferrals()
      .then(setInfo)
      .finally(() => setLoading(false));
  };

  const loadTasks = () => {
    setTasksLoading(true);
    fetchTasks()
      .then(({ tasks }) => setTasks(tasks))
      .finally(() => setTasksLoading(false));
  };

  useEffect(() => {
    load();
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the Payment Hub redirects back here for a verified task, the URL
  // carries ?taskId=...&reference=...&status=... — confirm server-side
  // (which re-checks with the hub/Paystack) and credit the task's reward.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');
    const reference = params.get('reference');
    if (!taskId || !reference) return;

    setVerifying(true);
    confirmTaskVerification(taskId, reference)
      .then(({ bonus, alreadyCompleted, state: updated }) => {
        onStateChange(updated);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t)));
        setTaskMessage(alreadyCompleted ? 'This task was already verified.' : `Verified! +${formatGhs(bonus, state.pointsPerGhs)} added.`);
      })
      .catch((err) => {
        setTaskMessage(err instanceof Error ? err.message : 'Could not confirm verification yet — try again shortly.');
      })
      .finally(() => {
        setVerifying(false);
        setTimeout(() => setTaskMessage(null), 3500);
        params.delete('taskId');
        params.delete('reference');
        params.delete('status');
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
        window.history.replaceState({}, '', clean);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can still select/copy the text manually.
    }
  };

  const handleRedeem = async () => {
    if (!codeInput.trim()) return;
    try {
      const { bonus, state: updated } = await redeemReferral(codeInput.trim());
      onStateChange(updated);
      setRedeemMessage(`+${formatGhs(bonus, state.pointsPerGhs)} bonus applied!`);
      setCodeInput('');
      setTasks((prev) => prev.map((t) => (t.id === REDEEM_TASK_ID ? { ...t, completed: true } : t)));
      load();
    } catch (err) {
      setRedeemMessage(err instanceof Error ? err.message : 'Could not redeem that code');
    } finally {
      setTimeout(() => setRedeemMessage(null), 3000);
    }
  };

  const focusRedeemInput = () => {
    redeemInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    redeemInputRef.current?.focus();
  };

  const handleTaskClick = async (task: Task) => {
    if (task.completed || pendingId || !state.canEarn) return;

    // Verified tasks need a small real-money payment first — collect an
    // email (guests only) and hand off to the checkout flow instead.
    if ((task.verifyCost ?? 0) > 0) {
      if (accountEmail) {
        startTaskVerification(task, accountEmail);
      } else {
        setVerifyTask(task);
      }
      return;
    }

    if (task.url) window.open(task.url, '_blank', 'noopener,noreferrer');

    setPendingId(task.id);
    try {
      const { bonus, state: updated } = await completeTask(task.id);
      onStateChange(updated);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t)));
      setTaskMessage(`+${formatGhs(bonus, state.pointsPerGhs)} from "${task.title}"`);
    } catch {
      loadTasks();
    } finally {
      setPendingId(null);
      setTimeout(() => setTaskMessage(null), 2500);
    }
  };

  const startTaskVerification = async (task: Task, email: string) => {
    setPendingId(task.id);
    try {
      const { authorizationUrl, demo, bonus, state: updated } = await initializeTaskVerification(task.id, email);
      if (!authorizationUrl) {
        // DEMO mode: server completed the task immediately, no hub configured.
        if (updated) onStateChange(updated);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t)));
        setTaskMessage(demo ? `Verified (demo) — +${formatGhs(bonus ?? 0, state.pointsPerGhs)} added` : `+${formatGhs(bonus ?? 0, state.pointsPerGhs)} from "${task.title}"`);
        setPendingId(null);
        setTimeout(() => setTaskMessage(null), 2500);
        return;
      }
      // Full-page redirect to the hub's Paystack checkout. It sends the user
      // back here (with ?taskId=...&reference=...&status=...) once paid.
      window.location.href = authorizationUrl;
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : 'Could not start verification payment');
      setPendingId(null);
      setTimeout(() => setTaskMessage(null), 2500);
    }
  };

  const handleVerifyEmailSubmit = () => {
    if (!verifyTask) return;
    if (!verifyEmail.trim() || !verifyEmail.includes('@')) {
      setTaskMessage('Enter a valid email first');
      setTimeout(() => setTaskMessage(null), 2500);
      return;
    }
    localStorage.setItem(VERIFY_EMAIL_KEY, verifyEmail.trim());
    const task = verifyTask;
    setVerifyTask(null);
    startTaskVerification(task, verifyEmail.trim());
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const locked = !state.canEarn;
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="w-full max-w-xl px-4 pb-28">
      <ScreenHeader title="Earn" subtitle="Invite friends, complete tasks, earn together" points={state.points} pointsPerGhs={state.pointsPerGhs} />

      {loading || !info ? (
        <p className="text-center text-sm text-[#85827d] mt-6">Loading...</p>
      ) : (
        <>
          <div className="mt-4 bg-[#272a2f] rounded-2xl p-4 text-center">
            <p className="text-sm text-[#85827d]">Invite a friend and get</p>
            <div className="flex items-center justify-center space-x-1 mt-1">
              <img src={coinIcon} alt="" className="w-6 h-6" />
              <p className="text-2xl">{formatGhs(info.bonusPerFriend, state.pointsPerGhs)}</p>
            </div>
            <p className="text-[11px] text-[#85827d] mt-1">They get a welcome bonus too.</p>
          </div>

          <div className="mt-4 rounded-2xl p-4 bg-gradient-to-br from-[#2c2f36] to-[#1c1f24] border border-dashed border-[#43433b] relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#f3ba2f]/10"></div>
            <p className="text-xs text-[#85827d] mb-2">Your invite code — give it to a friend</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#1c1f24] rounded-lg px-3 py-2.5 text-center">
                <span className="text-lg font-extrabold tracking-[0.3em] text-[#f3ba2f]">{info.referralCode}</span>
              </div>
              <button
                onClick={handleCopy}
                className={`text-xs font-bold rounded-lg px-3 py-2.5 whitespace-nowrap transition-colors ${
                  copied ? 'bg-green-500 text-white' : 'bg-[#f3ba2f] text-black'
                }`}
              >
                {copied ? '✓ Copied' : 'Copy code'}
              </button>
            </div>
            <p className="text-[11px] text-[#85827d] mt-2 text-center">
              Your bonus unlocks once they redeem it in their own Friends tab.
            </p>
          </div>

          {!info.referredBy && (
            <div className="mt-4 bg-[#272a2f] rounded-2xl p-4">
              <p className="text-xs text-[#85827d] mb-2">Have a friend's code?</p>
              <div className="flex items-center gap-2">
                <input
                  ref={redeemInputRef}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d]"
                />
                <button
                  onClick={handleRedeem}
                  className="bg-[#43433b] text-white text-xs font-bold rounded-lg px-3 py-2 whitespace-nowrap"
                >
                  Redeem
                </button>
              </div>
              {redeemMessage && <p className="text-[11px] text-[#f3ba2f] mt-2">{redeemMessage}</p>}
            </div>
          )}

          <div className="mt-4">
            <p className="text-sm text-[#85827d] font-medium mb-2">
              {info.friends.length} friend{info.friends.length === 1 ? '' : 's'} invited
            </p>
            {info.friends.length === 0 ? (
              <div className="bg-[#272a2f] rounded-2xl p-6 text-center">
                <Friends size={32} className="mx-auto text-[#43433b]" />
                <p className="text-xs text-[#85827d] mt-2">No friends yet — share your link to start earning.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {info.friends.map((friend) => (
                  <div key={friend.userId} className="bg-[#272a2f] rounded-2xl p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-full bg-[#1c1f24]">
                        <Friends size={18} className="text-[#d4d4d4]" />
                      </div>
                      <p className="text-xs">Friend {friend.userId.slice(0, 6)}</p>
                    </div>
                    <span className="text-[11px] text-green-400">+{formatGhs(friend.earned, state.pointsPerGhs)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {taskMessage && <p className="text-center text-xs text-[#f3ba2f] mt-4">{taskMessage}</p>}
      {verifying && <p className="text-center text-xs text-[#85827d] mt-2">Confirming your verification...</p>}

      {/* --- Tasks: single card, header + progress bar, one row per task. --- */}
      <div className="mt-4 bg-[#272a2f] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-white">Tasks</p>
          {!tasksLoading && (
            <p className="text-[11px] text-[#85827d]">{completedCount}/{tasks.length} done</p>
          )}
        </div>

        {!tasksLoading && (
          <div className="w-full h-1.5 bg-[#1c1f24] rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-[#f3ba2f] to-[#ffdd7a] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {tasksLoading ? (
          <p className="text-center text-sm text-[#85827d] py-4">Loading...</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const isVerified = (task.verifyCost ?? 0) > 0;
              const isRedeemTask = task.id === REDEEM_TASK_ID;
              const isDone = task.completed || (isRedeemTask && Boolean(info?.referredBy));

              const rowClasses = isVerified
                ? `w-full text-left rounded-2xl p-3 flex items-center justify-between border transition-colors ${
                    isDone
                      ? 'bg-[#1c1f24] border-[#43433b] opacity-60'
                      : locked
                      ? 'bg-[#1c1f24] border-[#43433b] opacity-60'
                      : 'bg-gradient-to-br from-[#33291a] to-[#1c1f24] border-[#f3ba2f]/50'
                  }`
                : `w-full text-left bg-[#1c1f24] rounded-2xl p-3 flex items-center justify-between ${
                    isDone || locked ? 'opacity-60' : ''
                  }`;

              return (
                <div key={task.id}>
                  <button
                    onClick={() => (isRedeemTask ? focusRedeemInput() : handleTaskClick(task))}
                    disabled={isDone || pendingId === task.id || locked}
                    className={rowClasses}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-9 h-9 flex items-center justify-center rounded-full ${
                          isVerified ? 'bg-[#f3ba2f]/15' : 'bg-[#272a2f]'
                        }`}
                      >
                        <img src={coinIcon} alt="" className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-white">{task.title}</p>
                        <div className="flex items-center flex-wrap gap-1 mt-1">
                          <span className="flex items-center space-x-1">
                            <img src={coinIcon} alt="" className="w-3 h-3" />
                            <span className="text-[11px] text-[#85827d]">{formatGhs(task.reward, state.pointsPerGhs)}</span>
                          </span>
                          {isVerified && (
                            <span className="text-[10px] font-bold text-black bg-[#f3ba2f] rounded-full px-2 py-0.5">
                              🛡 Verify GH₵{(task.verifyCost ?? 0).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                        isDone
                          ? 'text-green-400'
                          : locked
                          ? 'text-[#85827d]'
                          : isVerified
                          ? 'bg-[#f3ba2f] text-black'
                          : 'bg-[#272a2f] text-white'
                      }`}
                    >
                      {isDone
                        ? '✓ Done'
                        : locked
                        ? '🔒'
                        : pendingId === task.id
                        ? '...'
                        : isVerified
                        ? 'Verify'
                        : isRedeemTask
                        ? 'Enter code'
                        : 'Go'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {verifyTask && (
        <div className="mt-4 bg-gradient-to-br from-[#33291a] to-[#1c1f24] border border-[#f3ba2f]/50 rounded-2xl p-4">
          <p className="text-xs text-white font-medium">🛡 {verifyTask.title}</p>
          <p className="text-[11px] text-[#85827d] mt-1">
            Verifying costs GH₵{(verifyTask.verifyCost ?? 0).toFixed(2)}. Enter an email for your receipt to continue.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="email"
              value={verifyEmail}
              onChange={(e) => setVerifyEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d]"
            />
            <button
              onClick={handleVerifyEmailSubmit}
              className="bg-[#f3ba2f] text-black text-xs font-bold rounded-lg px-3 py-2 whitespace-nowrap"
            >
              Continue
            </button>
            <button
              onClick={() => setVerifyTask(null)}
              className="bg-[#1c1f24] text-white text-xs font-bold rounded-lg px-3 py-2 whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsScreen;
