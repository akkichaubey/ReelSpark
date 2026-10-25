import React from 'react';
import { Check, Loader2 } from 'lucide-react';

interface ProgressCircleProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
  completed?: boolean;
}

/** Circular progress indicator for tasks with a real, measurable percentage. */
export const ProgressCircle: React.FC<ProgressCircleProps> = ({
  value,
  size = 28,
  strokeWidth = 3,
  label = 'Progress',
  className = 'text-amber-400',
  completed,
}) => {
  const percent = Math.round(Math.max(0, Math.min(100, value)));
  const isComplete = completed ?? percent >= 100;
  const center = 22;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      role={isComplete ? 'img' : 'progressbar'}
      aria-label={isComplete ? `${label} complete` : label}
      aria-valuemin={isComplete ? undefined : 0}
      aria-valuemax={isComplete ? undefined : 100}
      aria-valuenow={isComplete ? undefined : percent}
      className={`relative inline-flex shrink-0 items-center justify-center ${isComplete ? 'text-emerald-400' : className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      {isComplete ? (
        <Check aria-hidden="true" className="relative h-[62%] w-[62%]" strokeWidth={3.5} />
      ) : (
        <span aria-hidden="true" className="relative font-mono font-bold leading-none" style={{ fontSize: Math.max(7, size * 0.22) }}>
          {percent}%
        </span>
      )}
    </span>
  );
};

interface UploadProgressIndicatorProps extends Omit<ProgressCircleProps, 'value' | 'completed'> {
  progress: number;
  processing?: boolean;
  complete?: boolean;
}

/** Consistent upload feedback: percentage while transferring, spinner while the server works, check on success. */
export const UploadProgressIndicator: React.FC<UploadProgressIndicatorProps> = ({
  progress,
  processing = false,
  complete = false,
  size = 28,
  strokeWidth = 3,
  label = 'Upload',
  className = 'text-amber-400',
}) => {
  if (complete) {
    return <ProgressCircle value={100} size={size} strokeWidth={strokeWidth} label={label} completed />;
  }

  if (processing) {
    return (
      <span
        role="status"
        aria-label={`${label} processing`}
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <Loader2 aria-hidden="true" className="h-[68%] w-[68%] animate-spin" />
      </span>
    );
  }

  return <ProgressCircle value={progress} size={size} strokeWidth={strokeWidth} label={label} className={className} completed={false} />;
};
