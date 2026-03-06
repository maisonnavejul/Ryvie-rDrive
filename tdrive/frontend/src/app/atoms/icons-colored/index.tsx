import React, { ComponentProps } from 'react';

import { ReactComponent as DismissSvg } from './assets/dismiss.svg';
import { ReactComponent as NotFoundSvg } from './assets/not-found.svg';
import { ReactComponent as FileTypeArchiveSvg } from './assets/file-type-archive.svg';
import { ReactComponent as FileTypeDocumentSvg } from './assets/file-type-document.svg';
import { ReactComponent as FileTypeTextSvg } from './assets/file-type-text.svg';
import { ReactComponent as FileTypePdfSvg } from './assets/file-type-pdf.svg';
import { ReactComponent as FileTypeSpreadsheetSvg } from './assets/file-type-spreadsheet.svg';
import { ReactComponent as FileTypeUnknownSvg } from './assets/file-type-unknown.svg';
import { ReactComponent as FileTypeMediaSvg } from './assets/file-type-media.svg';
import { ReactComponent as FileTypeSlidesSvg } from './assets/file-type-slides.svg';
import { ReactComponent as FileTypeLinkSvg } from './assets/file-type-link.svg';
import { ReactComponent as FolderSvg } from './assets/folder.svg';
import { ReactComponent as ArrowDownSvg } from './assets/arrow-down.svg';
import { ReactComponent as ArrowUpSvg } from './assets/arrow-up.svg';
import { ReactComponent as CheckGreenSvg } from './assets/check-green.svg';
import { ReactComponent as ShowFolderSvg } from './assets/icon-show-folder.svg';
import { ReactComponent as ResumeSvg } from './assets/icon-resume.svg';
import { ReactComponent as PauseSvg } from './assets/icon-pause.svg';
import { ReactComponent as CancelSvg } from './assets/icon-cancel.svg';
import { ReactComponent as RemoveSvg } from './assets/remove.svg';
import { ReactComponent as SentSvg } from './assets/sent.svg';

export const DismissIcon = (props: ComponentProps<'svg'>) => <DismissSvg {...props} />;
export const NotFoundIcon = (props: ComponentProps<'svg'>) => <NotFoundSvg {...props} />;
export const FileTypeArchiveIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeArchiveSvg {...props} />
);
export const FileTypePdfIcon = (props: ComponentProps<'svg'>) => <FileTypePdfSvg {...props} />;
export const FileTypeDocumentIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeDocumentSvg {...props} />
);
export const FileTypeTextIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeTextSvg {...props} />
);
export const FileTypeSpreadsheetIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeSpreadsheetSvg {...props} />
);
export const FileTypeUnknownIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeUnknownSvg {...props} />
);

export const FileTypeMediaIcon = (props: ComponentProps<'svg'>) => <FileTypeMediaSvg {...props} />;

export const FileTypeSlidesIcon = (props: ComponentProps<'svg'>) => (
  <FileTypeSlidesSvg {...props} />
);

export const FileTypeLinkIcon = (props: ComponentProps<'svg'>) => <FileTypeLinkSvg {...props} />;

export const FolderIcon = (props: ComponentProps<'svg'>) => <FolderSvg {...props} />;

export const ArrowDownIcon = (props: ComponentProps<'svg'>) => <ArrowDownSvg {...props} />;

export const ArrowUpIcon = (props: ComponentProps<'svg'>) => <ArrowUpSvg {...props} />;

export const CheckGreenIcon = (props: ComponentProps<'svg'>) => <CheckGreenSvg {...props} />;

export const ShowFolderIcon = (props: ComponentProps<'svg'>) => <ShowFolderSvg {...props} />;

export const ResumeIcon = (props: ComponentProps<'svg'>) => <ResumeSvg {...props} />;

export const PauseIcon = (props: ComponentProps<'svg'>) => <PauseSvg {...props} />;

export const CancelIcon = (props: ComponentProps<'svg'>) => <CancelSvg {...props} />;

export const RemoveIcon = (props: ComponentProps<'svg'>) => <RemoveSvg {...props} />;

export const SentIcon = (props: ComponentProps<'svg'>) => <SentSvg {...props} />;
