import React from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingEmployee ? 'Edit Employee' : 'Add Employee'}
      maxWidthClass="max-w-md"
    >
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
          <label className="text-xs font-medium text-[#737373] block mb-1.5">GitHub Username</label>
          <Input
            value={employeeForm.github_username}
            onChange={(e) => setEmployeeForm((f) => ({ ...f, github_username: e.target.value }))}
            placeholder="johndoe"
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Specialization</label>
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
    </Modal>
  );
};

export default EmployeeModal;
