import React from 'react';
import { X } from 'lucide-react';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface UserRestrictionsModalProps {
  showUserRestrictionsModal: boolean;
  selectedUserForRestrictions: User | null;
  customRestrictions: any[];
  userRestrictionsList: number[];
  userRestrictionsLoading: boolean;
  setShowUserRestrictionsModal: (show: boolean) => void;
  handleToggleUserRestriction: (restrictionId: number, isChecked: boolean) => void;
  toPascalCase: (str: string) => string;
}

const UserRestrictionsModal: React.FC<UserRestrictionsModalProps> = ({
  showUserRestrictionsModal,
  selectedUserForRestrictions,
  customRestrictions,
  userRestrictionsList,
  userRestrictionsLoading,
  setShowUserRestrictionsModal,
  handleToggleUserRestriction,
  toPascalCase,
}) => {
  if (!showUserRestrictionsModal || !selectedUserForRestrictions) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => setShowUserRestrictionsModal(false)}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <div>
            <h2 className="text-lg font-bold text-white">Manage Restrictions</h2>
            <p className="text-xs text-[#737373] mt-0.5">{selectedUserForRestrictions.name}</p>
          </div>
          <button
            onClick={() => setShowUserRestrictionsModal(false)}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
          {userRestrictionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
            </div>
          ) : customRestrictions.length === 0 ? (
            <p className="text-sm text-[#737373] text-center py-8">
              No custom restrictions available
            </p>
          ) : (
            customRestrictions.map((restriction) => (
              <label
                key={restriction.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={userRestrictionsList.includes(restriction.id)}
                  onChange={(e) =>
                    handleToggleUserRestriction(restriction.id, e.target.checked)
                  }
                  className="w-5 h-5 rounded cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white font-medium block">
                    {restriction.name}
                  </span>
                  <p className="text-xs text-[#737373] mt-0.5">
                    {toPascalCase(restriction.tab_name)} →{' '}
                    {toPascalCase(restriction.subsection)}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={() => setShowUserRestrictionsModal(false)}
            className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserRestrictionsModal;
