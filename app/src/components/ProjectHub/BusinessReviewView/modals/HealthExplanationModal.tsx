import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import type { HealthMeta } from '../lib/health';

interface Deduction {
  label: string;
  amount: number;
  detail: string;
}

interface HealthExplanationModalProps {
  health: HealthMeta;
  healthScore: number;
  deductions: Deduction[];
  onClose: () => void;
}

const HealthExplanationModal: React.FC<HealthExplanationModalProps> = ({
  health,
  healthScore,
  deductions,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${health.color}20` }}
            >
              <HelpCircle className="w-5 h-5" style={{ color: health.color }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">How Health is Calculated</h2>
              <p className="text-xs text-[#737373]">Score breakdown</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Score */}
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#737373]">Current Score</span>
              <span className="text-2xl font-bold text-white">{healthScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${healthScore}%`, backgroundColor: health.color }}
                />
              </div>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${health.color}20`, color: health.color }}
              >
                {health.label}
              </span>
            </div>
          </div>

          {/* How It Works */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">How It Works</h3>
            <div className="space-y-2 text-sm text-[#a3a3a3]">
              <p>
                Your project starts with a base score of{' '}
                <strong className="text-white">100 points</strong>.
              </p>
              <p>
                Points are deducted based on project health indicators below. The lower the
                deductions, the healthier your project.
              </p>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Deductions Applied</h3>
            <div className="space-y-3">
              {deductions.length > 0 ? (
                deductions.map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{d.label}</span>
                      <span className="text-sm font-bold text-[#EF4444]">-{d.amount}</span>
                    </div>
                    <p className="text-xs text-[#737373]">{d.detail}</p>
                  </div>
                ))
              ) : (
                <div className="bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] rounded-lg p-3">
                  <p className="text-sm text-[#34D399] font-medium">
                    ✓ No deductions - Project is healthy!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Score Ranges */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Score Ranges</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34D399' }} />
                <span className="text-sm text-[#a3a3a3]">
                  <strong>80-100:</strong> Healthy
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FBBF24' }} />
                <span className="text-sm text-[#a3a3a3]">
                  <strong>60-79:</strong> At Risk
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                <span className="text-sm text-[#a3a3a3]">
                  <strong>0-59:</strong> Critical
                </span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-lg p-3">
            <p className="text-xs text-[#E0B954] font-medium mb-2">✨ Tips to Improve Health</p>
            <ul className="text-xs text-[#a3a3a3] space-y-1">
              <li>• Resolve overdue items to reduce penalties</li>
              <li>• Fix bugs to maintain code quality</li>
              <li>• Keep milestone progress above 50%</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={onClose}
            className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthExplanationModal;
