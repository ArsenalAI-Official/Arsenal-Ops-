// Thin per-tab container: owns the Employees tab's data + modal state (via
// useEmployeesAdmin) and renders the tab plus its modal.
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminSpinner } from '../components/AdminSpinner';
import { useEmployeesAdmin } from '../hooks/useEmployeesAdmin';
import EmployeesTab from '../tabs/EmployeesTab';
import EmployeeModal from '../modals/EmployeeModal';

export default function EmployeesContainer() {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const {
    employees,
    developerCapacities,
    teamCapacity,
    availableSpecs,
    isLoading,
    showEmployeeModal,
    setShowEmployeeModal,
    editingEmployee,
    employeeForm,
    setEmployeeForm,
    handleEditEmployee,
    handleSaveEmployee,
    handleDeleteEmployee,
  } = useEmployeesAdmin(confirm);

  if (isLoading) return <AdminSpinner />;

  return (
    <>
      <EmployeesTab
        employees={employees}
        developerCapacities={developerCapacities}
        teamCapacity={teamCapacity}
        availableSpecs={availableSpecs}
        onEditEmployee={handleEditEmployee}
        onDeleteEmployee={handleDeleteEmployee}
        canWriteEmployees={can('admin.employees_write')}
      />
      <EmployeeModal
        open={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        editingEmployee={editingEmployee}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        handleSaveEmployee={handleSaveEmployee}
      />
      {confirmDialog}
    </>
  );
}
