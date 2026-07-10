import { EmployeeDocument } from '../../types/document';
import Button from '../ui/Button';
import './DocumentCard.css';

interface DocumentCardProps {
  document: EmployeeDocument;
  onView: () => void;
  onDelete: () => void;
  canDelete: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

function DocumentCard({ document, onView, onDelete, canDelete, isSelected = false, onSelect }: DocumentCardProps) {
  // Format file size as KB or MB
  const formatFileSize = (sizeInKB: number): string => {
    if (sizeInKB < 1024) {
      return `${sizeInKB} KB`;
    }
    const sizeInMB = sizeInKB / 1024;
    return `${sizeInMB.toFixed(2)} MB`;
  };

  // Format upload date as human-readable string
  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`document-card ${isSelected ? 'document-card--selected' : ''}`}>
      {onSelect && (
        <div className="document-card__checkbox-wrapper">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="document-card__checkbox"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="document-card__icon">
        📄
      </div>
      <div className="document-card__content">
        <h4 className="document-card__filename">{document.fileName}</h4>
        <div className="document-card__metadata">
          <span className="document-card__meta-item">
            <span className="document-card__meta-label">Uploaded:</span> {formatDate(document.uploadedAt)}
          </span>
          <span className="document-card__meta-item">
            <span className="document-card__meta-label">By:</span> {document.uploadedBy}
          </span>
          <span className="document-card__meta-item">
            <span className="document-card__meta-label">Size:</span> {formatFileSize(document.fileSize)}
          </span>
        </div>
      </div>
      <div className="document-card__actions">
        <Button variant="ghost" size="sm" onClick={onView}>
          👁️ View
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            🗑️ Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export default DocumentCard;
