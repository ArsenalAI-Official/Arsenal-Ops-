// Thin per-tab container: owns the Employees tab's data + modal state (via
// useEmployeesAdmin) and renders the tab plus its modal.
import { AdminSpinner } from '../components/AdminSpinner';
import { useEmployeesAdmin } from '../hooks/useEmployeesAdmin';
import EmployeesTab from '../tabs/EmployeesTab';
import EmployeeModal from '../modals/EmployeeModal';

export default function EmployeesContainer() {
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
  } = useEmployeesAdmin();

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
      />
      <EmployeeModal
        open={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        editingEmployee={editingEmployee}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        handleSaveEmployee={handleSaveEmployee}
      />
    </>
  );
}
