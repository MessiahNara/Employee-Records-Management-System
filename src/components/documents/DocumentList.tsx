import { EmployeeDocument } from '../../types/document';
import DocumentCard from './DocumentCard';
import Skeleton from '../ui/Skeleton';
import './DocumentList.css';

interface DocumentListProps {
  documents: EmployeeDocument[];
  onView: (document: EmployeeDocument) => void;
  onDelete: (documentId: string) => void;
  canDelete: boolean;
  loading?: boolean;
  selectedIds?: Set<string>;
  onSelectAll?: () => void;
  onSelectDocument?: (documentId: string) => void;
  isAllSelected?: boolean;
  isSomeSelected?: boolean;
}

function DocumentList({ 
  documents, 
  onView, 
  onDelete, 
  canDelete, 
  loading = false,
  selectedIds = new Set(),
  onSelectAll,
  onSelectDocument,
  isAllSelected = false,
  isSomeSelected = false,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="document-list">
        <Skeleton height="100px" />
        <Skeleton height="100px" />
        <Skeleton height="100px" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="document-list__empty">
        <div className="document-list__empty-icon">📭</div>
        <p className="document-list__empty-text">No documents in this category</p>
        <p className="document-list__empty-subtext">Upload a document to get started</p>
      </div>
    );
  }

  const showCheckboxes = canDelete && onSelectAll && onSelectDocument;

  return (
    <div className="document-list">
      {showCheckboxes && documents.length > 0 && (
        <div className="document-list__select-all">
          <label className="document-list__checkbox-label">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = isSomeSelected;
                }
              }}
              onChange={onSelectAll}
              className="document-list__checkbox"
            />
            <span>Select All ({documents.length})</span>
          </label>
        </div>
      )}
      
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          onView={() => onView(document)}
          onDelete={() => onDelete(document.id)}
          canDelete={canDelete}
          isSelected={selectedIds.has(document.id)}
          onSelect={onSelectDocument ? () => onSelectDocument(document.id) : undefined}
        />
      ))}
    </div>
  );
}

export default DocumentList;
