import Avatar from '../../../../../atoms/avatar';
import {
  FileTypeArchiveIcon,
  FileTypeDocumentIcon,
  FileTypeLinkIcon,
  FileTypeMediaIcon,
  FileTypePdfIcon,
  FileTypeSlidesIcon,
  FileTypeSpreadsheetIcon,
  FileTypeUnknownIcon,
} from '@atoms/icons-colored';
import { FolderIcon } from 'app/atoms/icons-colored';
import fileUploadApiClient from '@features/files/api/file-upload-api-client';
import type { DriveItem, FileMetadata } from 'app/features/drive/types';
import { ComponentProps } from 'react';

const FileTypeIcons: { [key: string]: (props: ComponentProps<'svg'>) => JSX.Element} = {
  image: FileTypeMediaIcon,
  video: FileTypeMediaIcon,
  archive: FileTypeArchiveIcon,
  pdf: FileTypePdfIcon,
  document: FileTypeDocumentIcon,
  spreadsheet: FileTypeSpreadsheetIcon,
  slides: FileTypeSlidesIcon,
  link: FileTypeLinkIcon,
};

const extensionToFileType: { [key: string]: string } = {
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', txt: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet', csv: 'spreadsheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides',
  pdf: 'pdf',
  zip: 'archive', rar: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image',
  mp4: 'video', avi: 'video', mov: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
};

export const DocumentIcon = (props: {
  item?: DriveItem;
  className?: string;
  fileType?: string;
  blueiffyFolders?: boolean;
}) => {
  let fileType = props.fileType || fileUploadApiClient.mimeToType(
    props.item?.last_version_cache?.file_metadata?.mime || '',
  );
  if (fileType === 'other' && props.item?.extension) {
    fileType = extensionToFileType[props.item.extension.toLowerCase()] || fileType;
  }
  const metadata = (props.item?.last_version_cache?.file_metadata || {}) as FileMetadata;
  const className = props.className || 'h-5 w-5 shrink-0 text-gray-400';
  const SpecificFileTypeIcon = FileTypeIcons[fileType] || FileTypeUnknownIcon;
  return (
    (metadata.thumbnails?.length || 0) > 0
    ? <Avatar
        className={props.className}
        avatar={metadata.thumbnails?.[0]?.url}
        size="xs"
        type="square"
        title={metadata.name}
        testClassId="avatar"
      />
    : props.item?.is_directory
      ? <FolderIcon className={className + (props.blueiffyFolders || props.blueiffyFolders == null ? ' text-blue-500' : '') + ' testid:folder-icon'} />
      : <SpecificFileTypeIcon className={className + ' testid:specific-file-type-icon'} />
  );
};
