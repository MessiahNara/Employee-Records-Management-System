import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Modal, Button } from './ui';
import './CameraScannerModal.css';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}

function CameraScannerModal({ isOpen, onClose, onDetected }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanHandledRef = useRef(false);
  const scanReadyRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  // Mirror selectedDeviceId in a ref so startScanner can read it without
  // selectedDeviceId being in the useEffect deps (which caused double-runs).
  const selectedDeviceIdRef = useRef('');
  selectedDeviceIdRef.current = selectedDeviceId;

  const [isStarting, setIsStarting] = useState(false);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryNonce, setRetryNonce] = useState(0);

  const hasMultipleCameras = useMemo(() => devices.length > 1, [devices.length]);
  const supportsLiveCamera = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const requiresSecureContext = typeof window !== 'undefined' && !window.isSecureContext;
  const secureContextUrl =
    typeof window !== 'undefined' && requiresSecureContext
      ? `https://${window.location.host}${window.location.pathname}`
      : '';

  const stopScanner = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      codeReaderRef.current = null;
      setErrorMessage('');
      setDevices([]);
      selectedDeviceIdRef.current = '';
      setSelectedDeviceId('');
      return;
    }

    let isCancelled = false;
    setIsStarting(true);
    scanHandledRef.current = false;
    scanReadyRef.current = false;
    setErrorMessage('');

    const startScanner = async () => {
      try {
        if (!supportsLiveCamera) {
          setErrorMessage(
            requiresSecureContext
              ? `Live camera scanning requires HTTPS or localhost on mobile browsers. Open ${secureContextUrl || 'the HTTPS URL'} and try again, or scan by taking/uploading a photo below.`
              : 'Live camera APIs are not available in this environment. You can still scan by taking or uploading a photo below.'
          );
          return;
        }

        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        // Request camera access first so device labels are available and permission flow is explicit.
        const previewStream = await navigator.mediaDevices.getUserMedia({
          video: selectedDeviceIdRef.current
            ? { deviceId: { exact: selectedDeviceIdRef.current } }
            : { facingMode: { ideal: 'environment' } },
        });
        mediaStreamRef.current = previewStream;

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
        if (isCancelled) return;

        setDevices(videoDevices);

        const preferredDevice =
          selectedDeviceIdRef.current ||
          videoDevices.find((device) => /back|rear|environment/i.test(device.label))?.deviceId ||
          videoDevices[0]?.deviceId ||
          '';

        if (!preferredDevice) {
          setErrorMessage('No camera was found on this device.');
          return;
        }

        if (!selectedDeviceIdRef.current) {
          selectedDeviceIdRef.current = preferredDevice;
          setSelectedDeviceId(preferredDevice);
        }

        if (!videoRef.current) {
          setErrorMessage('Camera preview could not be initialized.');
          return;
        }

        // Ignore detections for a short grace period after startup so the same
        // barcode/QR still in frame from the previous scan is not re-triggered.
        readyTimerRef.current = setTimeout(() => {
          scanReadyRef.current = true;
        }, 900);

        controlsRef.current = await reader.decodeFromStream(
          previewStream,
          videoRef.current,
          (result) => {
            if (!result || scanHandledRef.current || !scanReadyRef.current) {
              return;
            }

            scanHandledRef.current = true;
            if (readyTimerRef.current !== null) {
              clearTimeout(readyTimerRef.current);
              readyTimerRef.current = null;
            }
            const rawValue = result.getText().trim();

            stopScanner();
            onDetected(rawValue);
            onClose();
          }
        );
      } catch (error) {
        const err = error as { name?: string; message?: string };

        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          setErrorMessage('Camera permission was denied. Please allow camera access and try again.');
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          setErrorMessage('No camera device was detected on this computer.');
        } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
          setErrorMessage('Camera is busy or blocked by another app. Close other camera apps and retry.');
        } else if (err?.name === 'OverconstrainedError') {
          setErrorMessage('Selected camera is not available. Please switch camera and retry.');
        } else {
          setErrorMessage('Unable to access camera. Please allow camera permissions and try again.');
        }

        console.error('Camera scanner error:', err?.name, err?.message, error);
      } finally {
        if (!isCancelled) {
          setIsStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      if (readyTimerRef.current !== null) {
        clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
      scanReadyRef.current = false;
      stopScanner();
      codeReaderRef.current = null;
    };
  }, [isOpen, onClose, onDetected, retryNonce, requiresSecureContext, supportsLiveCamera]); // selectedDeviceId intentionally omitted — use selectedDeviceIdRef

  const handleRetry = () => {
    stopScanner();
    setErrorMessage('');
    setRetryNonce((prev) => prev + 1);
  };

  const handleDeviceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    stopScanner();
    selectedDeviceIdRef.current = event.target.value;
    setSelectedDeviceId(event.target.value);
    setRetryNonce((prev) => prev + 1);
  };

  const handleOpenImagePicker = () => {
    imageInputRef.current?.click();
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsDecodingImage(true);
    setErrorMessage('');

    const objectUrl = URL.createObjectURL(file);

    try {
      const reader = codeReaderRef.current || new BrowserMultiFormatReader();
      codeReaderRef.current = reader;

      const result = await reader.decodeFromImageUrl(objectUrl);
      const rawValue = result.getText().trim();

      if (!rawValue) {
        throw new Error('Empty scan result');
      }

      onDetected(rawValue);
      onClose();
    } catch (error) {
      console.error('Image scan error:', error);
      setErrorMessage('No barcode or QR code was detected in the selected image.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      event.target.value = '';
      setIsDecodingImage(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan Barcode / QR Code" size="md">
      <div className="camera-scanner">
        <p className="camera-scanner__help">
          Point the camera at a barcode or QR code. Scanning starts automatically.
        </p>

        {requiresSecureContext && (
          <p className="camera-scanner__notice">
            This mobile browser is using a non-secure LAN URL. Live camera needs HTTPS or localhost.
            {secureContextUrl ? ` Open ${secureContextUrl}.` : ''} Photo-based scanning will still work.
          </p>
        )}

        {supportsLiveCamera && hasMultipleCameras && (
          <label className="camera-scanner__device-label" htmlFor="camera-device-select">
            Camera
            <select
              id="camera-device-select"
              className="camera-scanner__device-select"
              value={selectedDeviceId}
              onChange={handleDeviceChange}
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="camera-scanner__viewport" aria-live="polite">
          {supportsLiveCamera ? (
            <>
              <video ref={videoRef} className="camera-scanner__video" muted playsInline />
              <div className="camera-scanner__target" />
              {isStarting && <div className="camera-scanner__status">Starting camera...</div>}
            </>
          ) : (
            <div className="camera-scanner__fallback">
              <div className="camera-scanner__fallback-title">Live camera unavailable</div>
              <div className="camera-scanner__fallback-text">
                Use the button below to take a photo or choose an image containing the barcode or QR code.
              </div>
            </div>
          )}
        </div>

        {errorMessage && <p className="camera-scanner__error">{errorMessage}</p>}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="camera-scanner__file-input"
          onChange={handleImageFileChange}
        />

        <div className="camera-scanner__actions">
          <Button variant="ghost" onClick={handleOpenImagePicker} loading={isDecodingImage}>
            {isDecodingImage ? 'Scanning Image...' : 'Use Photo'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {supportsLiveCamera && errorMessage && (
            <Button variant="primary" onClick={handleRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default CameraScannerModal;