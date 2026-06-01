import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { SyncProgressAtom } from '@features/drive/state/sync-progress';
import { useCloudImport } from '@features/drive/hooks/use-cloud-import';
import { ArrowDownIcon, ArrowUpIcon } from 'app/atoms/icons-colored';
import Languages from '@features/global/services/languages-service';

export const SyncProgressBar: React.FC = () => {
  const syncProgress = useRecoilValue(SyncProgressAtom);
  const { cancelSync } = useCloudImport();
  const [expanded, setExpanded] = useState(true);

  if (!syncProgress.active) return null;

  const percent = syncProgress.total > 0
    ? Math.round((syncProgress.current / syncProgress.total) * 100)
    : 0;

  const providerLabel = syncProgress.provider === 'googledrive' ? 'Google Drive' : 'Dropbox';

  return (
    <div
      className="fixed bottom-4 right-4 w-full sm:w-1/2 md:w-1/3 max-w-lg shadow-lg rounded-sm overflow-hidden z-50
              sm:right-4 sm:left-auto sm:translate-x-0 left-1/2 -translate-x-1/2"
    >
      {/* Header - dark bar matching upload style */}
      <div className="w-full flex bg-[#45454A] text-white p-4 items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.42 31.42" strokeLinecap="round" />
          </svg>
          <p className="text-sm truncate">
            {Languages.t('components.sync_progress.syncing', [], 'Synchronisation')} {providerLabel}
            {syncProgress.total > 0 && ` — ${percent}%`}
          </p>
        </div>
        <button
          className="ml-auto flex items-center shrink-0"
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? <ArrowDownIcon /> : <ArrowUpIcon />}
        </button>
      </div>

      {/* Body - expandable */}
      <div className={`${expanded ? 'block' : 'hidden'}`}>
        <div className="bg-white px-4 py-3">
          {/* Progress bar */}
          <div className="w-full h-[3px] bg-[#F0F2F3] mb-2">
            <div
              className="h-full bg-[#00A029] transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Current file info */}
          <p className="text-xs text-gray-500 truncate mb-1">
            {syncProgress.currentFile}
          </p>

          {syncProgress.total > 0 && (
            <p className="text-xs text-gray-400">
              {syncProgress.current}/{syncProgress.total} {Languages.t('components.sync_progress.elements', [], 'éléments')}
            </p>
          )}
        </div>

        {/* Footer - cancel button */}
        <div className="w-full flex bg-[#F0F2F3] text-black p-4 items-center justify-end">
          <button
            className="text-blue-500 px-4 py-2 rounded bg-transparent transition-all duration-300 ease-in-out
              hover:bg-blue-600 hover:text-white"
            onClick={cancelSync}
            disabled={syncProgress.cancelled}
          >
            {syncProgress.cancelled
              ? Languages.t('components.sync_progress.cancelling', [], 'Annulation...')
              : Languages.t('general.cancel', [], 'Annuler')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncProgressBar;
