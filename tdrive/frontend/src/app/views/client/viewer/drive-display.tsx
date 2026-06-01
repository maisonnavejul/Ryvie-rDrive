import {
  useDrivePreviewDisplayData,
  useDrivePreviewLoading,
  useDrivePreviewModal,
} from '@features/drive/hooks/use-drive-preview';
import { ArrowDownTrayIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import ImageDisplay from './images/display';
import VideoDisplay from './videos/display';
import PdfDisplay from './pdf/display';
import CodeDisplay from './code/display';
import ArchiveDisplay from './archive/display';
import OtherDisplay from './other/display';
import LinkDisplay from './link/display';

const supportedOfficeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];

const UnsupportedDisplay = ({ download, name }: { download: string; name: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-white/80 gap-4">
    <EyeSlashIcon className="w-16 h-16 text-white/40" />
    <p className="text-lg font-medium">Prévisualisation non disponible</p>
    <p className="text-sm text-white/50 max-w-md text-center">
      Ce type de fichier ne peut pas être prévisualisé.
    </p>
    <button
      className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
      onClick={() => window.location.href = download}
    >
      <ArrowDownTrayIcon className="w-4 h-4" />
      Télécharger
    </button>
  </div>
);

export default (): React.ReactElement => {
  const { download, type, name, id, extension } = useDrivePreviewDisplayData();
  const { isOpen } = useDrivePreviewModal();
  const { loading, setLoading } = useDrivePreviewLoading();

  if (!download || !isOpen || !id) {
    return <></>;
  }

  const normalizedExt = String(extension || '').toLowerCase();

  // If type is not resolved yet, try Office/Other display based on extension instead of failing
  if (!type && normalizedExt && supportedOfficeExts.includes(normalizedExt)) {
    return <OtherDisplay download={download} name={name} id={id} />;
  }

  switch (type) {
    case 'image':
      return <ImageDisplay loading={loading} setLoading={setLoading} download={download} />;
    case 'video':
    case 'audio':
      return <VideoDisplay download={download} />;
    case 'code':
      return <CodeDisplay download={download} name={name} />;
    case 'archive':
      return <ArchiveDisplay download={download} name={name} />;
    case 'pdf':
      return <PdfDisplay download={download} name={name} />;
    case 'link':
      return <LinkDisplay download={download} name={name} />;
    case 'document':
    case 'slides':
    case 'spreadsheet':
      // Only use OnlyOffice for actual office formats
      if (normalizedExt && supportedOfficeExts.includes(normalizedExt)) {
        return <OtherDisplay download={download} name={name} id={id} />;
      }
      return <UnsupportedDisplay download={download} name={name} />;
    default:
      // Only try OtherDisplay (OnlyOffice) for known office extensions
      if (normalizedExt && supportedOfficeExts.includes(normalizedExt)) {
        return <OtherDisplay download={download} name={name} id={id} />;
      }
      return <UnsupportedDisplay download={download} name={name} />;
  }
};
