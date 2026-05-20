import React from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EmployeeLike {
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  specialization: string | null;
}

interface EmployeeFormState {
  name: string;
  email: string;
  github_username: string;
  specialization: string;
}

interface EmployeeModalProps {
  open: boolean;
  onClose: () => void;
  editingEmployee: EmployeeLike | null;
  employeeForm: EmployeeFormState;
  setEmployeeForm: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  handleSaveEmployee: () => void;
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({
  open,
  onClose,
  editingEmployee,
  employeeForm,
  setEmployeeForm,
  handleSaveEmployee,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">
            {editingEmployee ? 'Edit Employee' : 'Add Employee'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Name *</label>
            <Input
              value={employeeForm.name}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="John Doe"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Email *</label>
            <Input
              type="email"
              value={employeeForm.email}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="john@company.com"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              GitHub Username
            </label>
            <Input
              value={employeeForm.github_username}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, github_username: e.target.value }))}
              placeholder="johndoe"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Specialization
            </label>
            <select
              value={employeeForm.specialization}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, specialization: e.target.value }))}
              className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
            >
              <option value="">Select specialization</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="fullstack">Full Stack</option>
              <option value="devops">DevOps</option>
              <option value="qa">QA</option>
              <option value="mobile">Mobile</option>
              <option value="data">Data</option>
              <option value="ml">Machine Learning</option>
              <option value="design">Design</option>
              <option value="pm">Product Manager</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
            Cancel
          </Button>
          <Button
            onClick={handleSaveEmployee}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
          >
            <Save className="w-4 h-4 mr-2" />
            {editingEmployee ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeModal;
