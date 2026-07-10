import { useState, useRef } from 'react';
import Button from './ui/Button';
import { MdCloudUpload, MdDelete, MdPerson } from 'react-icons/md';
import './ProfilePictureUpload.css';

interface ProfilePictureUploadProps {
  currentPicture?: string;
  firstName: string;
  lastName: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  disabled?: boolean;
}

function ProfilePictureUpload({
  currentPicture,
  firstName,
  lastName,
  onUpload,
  onRemove,
  disabled = false,
}: ProfilePictureUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/pjpeg', 'image/x-png'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

  const getInitials = () => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const isAllowedImageFile = (file: File) => {
    const mimeType = file.type.toLowerCase();
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    return ALLOWED_TYPES.includes(mimeType) || ALLOWED_EXTENSIONS.includes(`.${extension}`);
  };

  const validateFile = (file: File): string | null => {
    if (!isAllowedImageFile(file)) {
      return 'Only JPG and PNG images are allowed';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 2MB';
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setError('');
      await onUpload(selectedFile);
      setSelectedFile(null);
      setPreview(null);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;

    try {
      setIsUploading(true);
      setError('');
      await onRemove();
      setSelectedFile(null);
      setPreview(null);
    } catch (err: any) {
      setError(err.message || 'Failed to remove image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreview(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayImage = preview || currentPicture;

  return (
    <div className="profile-picture-upload">
      <div className="profile-picture-upload__preview-section">
        <div className="profile-picture-upload__preview">
          {displayImage ? (
            <img
              src={displayImage}
              alt="Profile"
              className="profile-picture-upload__image"
            />
          ) : (
            <div className="profile-picture-upload__placeholder">
              <MdPerson className="profile-picture-upload__placeholder-icon" />
              <div className="profile-picture-upload__initials">{getInitials()}</div>
            </div>
          )}
        </div>
        <div className="profile-picture-upload__info">
          <h4 className="profile-picture-upload__title">Profile Picture</h4>
          <p className="profile-picture-upload__description">
            Upload a profile picture (JPG or PNG, max 2MB)
          </p>
        </div>
      </div>

      {!selectedFile && (
        <div
          className={`profile-picture-upload__dropzone ${
            isDragging ? 'profile-picture-upload__dropzone--dragging' : ''
          } ${disabled ? 'profile-picture-upload__dropzone--disabled' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!disabled ? handleUploadClick : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/jpg,image/png"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            disabled={disabled}
          />
          <MdCloudUpload className="profile-picture-upload__upload-icon" />
          <p className="profile-picture-upload__dropzone-text">
            {isDragging ? 'Drop image here' : 'Click to upload or drag and drop'}
          </p>
          <p className="profile-picture-upload__dropzone-hint">
            JPG or PNG (max 2MB)
          </p>
        </div>
      )}

      {selectedFile && (
        <div className="profile-picture-upload__selected">
          <div className="profile-picture-upload__selected-info">
            <p className="profile-picture-upload__selected-name">{selectedFile.name}</p>
            <p className="profile-picture-upload__selected-size">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <div className="profile-picture-upload__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              loading={isUploading}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      )}

      {currentPicture && !selectedFile && onRemove && (
        <div className="profile-picture-upload__remove">
          <Button
            variant="danger"
            size="sm"
            onClick={handleRemove}
            disabled={isUploading || disabled}
            loading={isUploading}
          >
            <MdDelete style={{ marginRight: '0.25rem' }} />
            {isUploading ? 'Removing...' : 'Remove Picture'}
          </Button>
        </div>
      )}

      {error && (
        <div className="profile-picture-upload__error">
          <span className="profile-picture-upload__error-icon">⚠️</span>
          {error}
        </div>
      )}
    </div>
  );
}

export default ProfilePictureUpload;
