import React from 'react';
import { Input } from '@/components/ui/input';

interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
}

export const NumberInput: React.FC<NumberInputProps> = ({ value, onChange }) => (
  <Input
    type="number"
    value={value}
    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white"
  />
);

interface TextInputProps {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ value, onChange, placeholder }) => (
  <Input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white"
  />
);

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, subtitle, children }) => (
  <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, children, className }) => (
  <div className={className}>
    <label className="block text-[10px] uppercase tracking-wider text-[#737373] mb-1">
      {label}
    </label>
    {children}
  </div>
);
