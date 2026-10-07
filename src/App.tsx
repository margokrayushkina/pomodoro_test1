import { useState, useEffect, useCallback, useRef } from 'react';

// Types
type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface TimerSettings {
  focus: number;
  shortBreak: number;
  longBreak: number;
}

interface FocusSession {
  date: string;
  duration: number;
  completedAt: string;
}

interface Statistics {
  sessions: FocusSession[];
  totalFocusMinutes: number;
}

// Helper functions
const getTodayKey = (): string => {
  return new Date().toISOString().split('T')[0];
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Custom hook for localStorage
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  return [storedValue, setValue];
}

// Mode configuration
const modeConfig: Record<TimerMode, { label: string; color: string; bgColor: string; ringColor: string; icon: string }> = {
  focus: {
    label: 'Фокусировка',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    ringColor: 'stroke-rose-500',
    icon: '🎯',
  },
  shortBreak: {
    label: 'Короткий перерыв',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    ringColor: 'stroke-emerald-500',
    icon: '☕',
  },
  longBreak: {
    label: 'Длительный перерыв',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    ringColor: 'stroke-blue-500',
    icon: '🌿',
  },
};

function App() {
  const [mode, setMode] = useState<TimerMode>('focus');
  const [settings, setSettings] = useLocalStorage<TimerSettings>('pomodoro-settings', {
    focus: 25,
    shortBreak: 5,
    longBreak: 15,
  });
  const [statistics, setStatistics] = useLocalStorage<Statistics>('pomodoro-statistics', {
    sessions: [],
    totalFocusMinutes: 0,
  });
  const [timeLeft, setTimeLeft] = useState(settings.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const totalTime = settings[mode] * 60;
  const progress = (totalTime - timeLeft) / totalTime;

  // Today's statistics
  const todayKey = getTodayKey();
  const todaySessions = statistics.sessions.filter(s => s.date === todayKey);
  const todayFocusMinutes = todaySessions.reduce((acc, s) => acc + s.duration, 0);
  const todaySessionCount = todaySessions.length;

  // Timer logic
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleComplete = useCallback(() => {
    clearTimer();
    setIsRunning(false);

    if (mode === 'focus') {
      const session: FocusSession = {
        date: todayKey,
        duration: settings.focus,
        completedAt: new Date().toISOString(),
      };
      setStatistics(prev => ({
        sessions: [...prev.sessions, session],
        totalFocusMinutes: prev.totalFocusMinutes + settings.focus,
      }));
      setCompletedPomodoros(prev => prev + 1);

      // Play notification sound
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => { oscillator.stop(); audioContext.close(); }, 300);
      } catch {}
    }
  }, [mode, settings.focus, todayKey, clearTimer, setStatistics]);

  useEffect(() => {
    if (isRunning) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      intervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isRunning, clearTimer, handleComplete]);

  // Update document title
  useEffect(() => {
    document.title = isRunning
      ? `${formatTime(timeLeft)} — ${modeConfig[mode].label}`
      : 'Pomodoro Focus Timer';
  }, [timeLeft, isRunning, mode]);

  const handleStart = () => {
    if (timeLeft > 0) {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    clearTimer();
    setTimeLeft(settings[mode] * 60);
    startTimeRef.current = null;
  };

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false);
    clearTimer();
    setMode(newMode);
    setTimeLeft(settings[newMode] * 60);
    startTimeRef.current = null;
  };

  const handleSettingsChange = (key: keyof TimerSettings, value: number) => {
    const clampedValue = Math.max(1, Math.min(120, value));
    setSettings(prev => ({ ...prev, [key]: clampedValue }));
    if (key === mode && !isRunning) {
      setTimeLeft(clampedValue * 60);
    }
  };

  const clearStatistics = () => {
    setStatistics({ sessions: [], totalFocusMinutes: 0 });
    setCompletedPomodoros(0);
  };

  // SVG circle parameters
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className={`min-h-screen transition-colors duration-500 ${modeConfig[mode].bgColor} flex flex-col`}>
      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍅</span>
          <h1 className="text-xl font-bold text-gray-800">Pomodoro Timer</h1>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-white/60 transition-colors text-gray-600"
          title="Настройки"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-8 bg-white/50 backdrop-blur-sm rounded-2xl p-2 shadow-sm">
          {(Object.keys(modeConfig) as TimerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                mode === m
                  ? `bg-white shadow-md ${modeConfig[m].color} scale-105`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <span className="mr-1">{modeConfig[m].icon}</span>
              {modeConfig[m].label}
            </button>
          ))}
        </div>

        {/* Timer Circle */}
        <div className="relative mb-8">
          <svg className="w-72 h-72 md:w-80 md:h-80 transform -rotate-90" viewBox="0 0 320 320">
            {/* Background circle */}
            <circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-gray-200"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              className={modeConfig[mode].ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {/* Timer display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl md:text-7xl font-mono font-bold text-gray-800 tracking-wider">
              {formatTime(timeLeft)}
            </span>
            <span className={`text-sm font-medium mt-2 ${modeConfig[mode].color}`}>
              {modeConfig[mode].label}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full bg-white/70 hover:bg-white shadow-sm flex items-center justify-center transition-all hover:scale-105 text-gray-600"
            title="Сброс"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={isRunning ? handlePause : handleStart}
            className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 text-white ${
              isRunning
                ? 'bg-gray-700 hover:bg-gray-800'
                : mode === 'focus' ? 'bg-rose-500 hover:bg-rose-600' : mode === 'shortBreak' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
            title={isRunning ? 'Пауза' : 'Старт'}
          >
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              handleReset();
              const modes: TimerMode[] = ['focus', 'shortBreak', 'longBreak'];
              const nextIdx = (modes.indexOf(mode) + 1) % modes.length;
              handleModeChange(modes[nextIdx]);
            }}
            className="w-12 h-12 rounded-full bg-white/70 hover:bg-white shadow-sm flex items-center justify-center transition-all hover:scale-105 text-gray-600"
            title="Следующий режим"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Pomodoro counter */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-gray-500">Завершённые сессии:</span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(completedPomodoros, 8) }).map((_, i) => (
              <span key={i} className="text-lg">🍅</span>
            ))}
            {completedPomodoros === 0 && <span className="text-sm text-gray-400">Пока нет</span>}
            {completedPomodoros > 8 && <span className="text-sm text-gray-500">+{completedPomodoros - 8}</span>}
          </div>
        </div>

        {/* Today's Statistics */}
        <div className="w-full max-w-md bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Статистика за сегодня
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-rose-600">{todaySessionCount}</div>
              <div className="text-xs text-gray-500 mt-1">Сессий</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{todayFocusMinutes}</div>
              <div className="text-xs text-gray-500 mt-1">Минут</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {todayFocusMinutes > 0 ? Math.round((todayFocusMinutes / (settings.focus * 4)) * 100) : 0}%
              </div>
              <div className="text-xs text-gray-500 mt-1">Цель</div>
            </div>
          </div>

          {/* Progress bar for daily goal */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Дневная цель: {settings.focus * 4} мин</span>
              <span>{todayFocusMinutes} / {settings.focus * 4} мин</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-rose-400 to-rose-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (todayFocusMinutes / (settings.focus * 4)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Настройки</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span>🎯</span> Фокусировка (минуты)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSettingsChange('focus', settings.focus - 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={settings.focus}
                    onChange={(e) => handleSettingsChange('focus', parseInt(e.target.value) || 1)}
                    className="w-20 text-center text-lg font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
                    min={1}
                    max={120}
                  />
                  <button
                    onClick={() => handleSettingsChange('focus', settings.focus + 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span>☕</span> Короткий перерыв (минуты)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSettingsChange('shortBreak', settings.shortBreak - 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={settings.shortBreak}
                    onChange={(e) => handleSettingsChange('shortBreak', parseInt(e.target.value) || 1)}
                    className="w-20 text-center text-lg font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    min={1}
                    max={120}
                  />
                  <button
                    onClick={() => handleSettingsChange('shortBreak', settings.shortBreak + 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <span>🌿</span> Длительный перерыв (минуты)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSettingsChange('longBreak', settings.longBreak - 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={settings.longBreak}
                    onChange={(e) => handleSettingsChange('longBreak', parseInt(e.target.value) || 1)}
                    className="w-20 text-center text-lg font-semibold border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    min={1}
                    max={120}
                  />
                  <button
                    onClick={() => handleSettingsChange('longBreak', settings.longBreak + 1)}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={clearStatistics}
                className="w-full py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                Очистить статистику
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        Фокусируйтесь. Отдыхайте. Достигайте целей.
      </footer>
    </div>
  );
}

export default App;
