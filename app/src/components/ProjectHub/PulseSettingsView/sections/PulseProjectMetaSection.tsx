import React from 'react';
import { PulseProjectMeta } from '../../pulseData';
import { Field, Section, TextInput } from '../inputs';

interface PulseProjectMetaSectionProps {
  project: PulseProjectMeta;
  onPatch: (patch: Partial<PulseProjectMeta>) => void;
}

const PulseProjectMetaSection: React.FC<PulseProjectMetaSectionProps> = ({ project, onPatch }) => (
  <Section title="Project metadata" subtitle="Display name, contract span, launch target">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      <Field label="Project name">
        <TextInput value={project.name} onChange={(v) => onPatch({ name: v })} />
      </Field>
      <Field label="Key prefix">
        <TextInput value={project.keyPrefix} onChange={(v) => onPatch({ keyPrefix: v })} />
      </Field>
      <Field label="Contract start">
        <TextInput
          value={project.contractStart}
          onChange={(v) => onPatch({ contractStart: v })}
          placeholder="e.g. Feb 2026"
        />
      </Field>
      <Field label="Launch target">
        <TextInput
          value={project.launchTarget}
          onChange={(v) => onPatch({ launchTarget: v })}
          placeholder="e.g. Sep 2026"
        />
      </Field>
      <Field label="Contract end">
        <TextInput
          value={project.contractEnd}
          onChange={(v) => onPatch({ contractEnd: v })}
          placeholder="e.g. Jan 2027"
        />
      </Field>
    </div>
  </Section>
);

export default PulseProjectMetaSection;
