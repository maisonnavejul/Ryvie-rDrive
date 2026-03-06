import { useRef, useCallback, useState, useEffect } from 'react';
import { Loader } from '@atoms/loader';

let pdfControls = {
  zoomIn: () => {},
  zoomOut: () => {},
};

export const getPdfControls = () => pdfControls;

export default (props: { download: string; name: string }) => {
  const url =
    '/public/viewer/PDFViewer/viewer.html' + '?link=' + encodeURIComponent(props.download);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  const zoomIn = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'zoomIn' }, '*');
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'zoomOut' }, '*');
    }
  }, []);

  pdfControls = { zoomIn, zoomOut };

  // Reset zoom and show loader when PDF URL changes
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'resetZoom' }, '*');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [props.download]);

  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 z-10">
          <Loader className="w-8 h-8 text-white" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="w-full h-full left-0 right-0 absolute bottom-0 top-0 testid:pdf-display"
        title={props.name}
        src={url}
        onLoad={() => setLoading(false)}
      />
    </>
  );
};
