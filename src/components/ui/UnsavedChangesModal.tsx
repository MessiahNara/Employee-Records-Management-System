import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { MdWarningAmber } from 'react-icons/md';
import './UnsavedChangesModal.css';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  title?: string;
  message?: string;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onKeepEditing,
  onDiscard,
  title = 'Unsaved Changes',
  message = 'You have unsaved changes in this form. If you close now, your progress will be lost. Are you sure you want to discard your changes?',
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onKeepEditing}
      title=""
      size="sm"
    >
      <div className="unsaved-changes-modal__content">
        <div className="unsaved-changes-modal__icon-wrapper">
          <MdWarningAmber />
        </div>
        <h3 className="unsaved-changes-modal__title">{title}</h3>
        <p className="unsaved-changes-modal__message">{message}</p>
        <div className="unsaved-changes-modal__actions">
          <Button variant="ghost" onClick={onKeepEditing}>
            Keep Editing
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UnsavedChangesModal;
