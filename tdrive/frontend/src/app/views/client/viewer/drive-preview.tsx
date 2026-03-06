import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useHistory } from 'react-router-dom';
import { Transition } from '@headlessui/react';
import { fadeTransition } from 'src/utils/transitions';
import { ArrowDownTrayIcon, XMarkIcon, ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { addShortcut, removeShortcut } from '@features/global/services/shortcut-service';
import RouterServices from '@features/router/services/router-service';
import useRouterCompany from '@features/router/hooks/use-router-company';
import {
  useDrivePreview,
  useDrivePreviewDisplayData,
  useDrivePreviewLoading,
} from '@features/drive/hooks/use-drive-preview';
import { formatSize } from '@features/global/utils/format-file-size';
import { formatDate } from '@features/global/utils/format-date';
import { DriveItem } from 'app/features/drive/types';
import { Modal } from '@atoms/modal';
import { Button } from '@atoms/button/button';
import { Loader } from '@atoms/loader';
import * as Text from '@atoms/text';
import DriveDisplay from './drive-display';
import Controls from './controls';

interface DrivePreviewProps {
  items: DriveItem[];
}
let currentItemIndex: number | undefined;

export const DrivePreview: React.FC<DrivePreviewProps> = ({ items }) => {
  const history = useHistory();
  const company = useRouterCompany();
  const { status, isOpen, open, close, loading } = useDrivePreview();
  const [modalLoading, setModalLoading] = useState(true);
  const { loading: loadingData } = useDrivePreviewLoading();
  let animationTimeout: number = setTimeout(() => undefined);

  const { download, extension, name, type = '', size, dateAdded } = useDrivePreviewDisplayData();

  useEffect(() => {
    if (!isOpen) {
      currentItemIndex = undefined;
      return;
    }

    if (currentItemIndex === undefined && items && status.item?.id) {
      currentItemIndex = items.findIndex(x => x.id === status.item?.id);
    }
  }, [status.item?.id, items, isOpen]);

  const handleSwitchRight = () => {
    if (currentItemIndex === undefined || currentItemIndex < 0) {
      return;
    }

    currentItemIndex = (currentItemIndex + 1) % items.length;
    switchPreview(items[currentItemIndex]);
  };

  const handleSwitchLeft = () => {
    if (currentItemIndex === undefined || currentItemIndex < 0) {
      return;
    }

    currentItemIndex = (currentItemIndex - 1 + items.length) % items.length;
    switchPreview(items[currentItemIndex]);
  };

  useEffect(() => {
    addShortcut({ shortcut: 'esc', handler: close });

    return () => {
      removeShortcut({ shortcut: 'esc', handler: close });
    };
  }, []);

  useEffect(() => {
    if (items.length < 2)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};

    addShortcut({ shortcut: 'Right', handler: handleSwitchRight });
    addShortcut({ shortcut: 'Left', handler: handleSwitchLeft });

    return () => {
      removeShortcut({ shortcut: 'Right' });
      removeShortcut({ shortcut: 'Left' });
    };
  }, [items?.map((item) => item.id).join(',')]);

  useEffect(() => {
    clearTimeout(animationTimeout);

    if (loading) {
      animationTimeout = window.setTimeout(() => {
        setModalLoading(false);
      }, 100);
    }
  }, [loading]);

  const switchPreview = async (item: DriveItem) => {
    //TODO[ASH] fix state management for this component
    //right now changing the routing leads to a lot of components rerender
    //and galery become unusable
    // history.push(
    //   RouterServices.generateRouteFromState({ companyId: company, itemId: item.id, }),
    // );
    open(item);
  };
  return (
    <Modal
      open={isOpen}
      closable={false}
      className="!bg-black/40 backdrop-blur-xl !sm:max-w-none !w-full !rounded-none !p-0 testid:preview-modal"
      style={{ maxWidth: 'none', margin: 0, left: 0, top: 0, height: '100vh' }}
      positioned={false}
    >

      <Transition
        show={modalLoading || loadingData}
        as="div"
        className="absolute m-auto w-8 h-8 left-0 right-0 top-0 bottom-0"
        {...fadeTransition}
      >
        <Loader className="w-8 h-8 text-white" />
      </Transition>

      <Transition
        show={!modalLoading}
        as="div"
        className="flex flex-col h-full"
        {...fadeTransition}
      >
        <div className="z-10 px-4 py-2 bg-black/60 backdrop-blur-md w-full flex items-center gap-3 text-white border-b border-white/10">
          <Button
            iconSize="sm"
            className="shrink-0 !rounded-full !bg-white/10 hover:!bg-white/20"
            theme="dark"
            size="sm"
            icon={XMarkIcon}
            onClick={() => {
              close();
              history.push(RouterServices.generateRouteFromState({ companyId: company, itemId: '' }));
            }}
            testClassId="drive-preview-button-close"
          />
          <div className="grow overflow-hidden">
            <p className="text-sm font-medium text-white truncate testid:preview-file-name">{name}</p>
            <p className="text-xs text-white/50 whitespace-nowrap testid:preview-file-info">
              {formatDate(dateAdded)} • {extension?.toLocaleUpperCase()}, {formatSize(size)}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <Controls type={type} />
            {items.length > 1 &&
              <>
                <Button
                  iconSize="md"
                  className="!rounded-full !bg-white/10 hover:!bg-white/20"
                  theme="dark"
                  size="sm"
                  icon={ArrowLeftIcon}
                  onClick={ handleSwitchLeft }
                  testClassId="drive-preview-button-switch-left"
                />
                <Button
                  iconSize="md"
                  className="!rounded-full !bg-white/10 hover:!bg-white/20"
                  theme="dark"
                  size="sm"
                  icon={ArrowRightIcon}
                  onClick={ handleSwitchRight }
                  testClassId="drive-preview-button-switch-right"
                />
              </>
            }
            <Button
              iconSize="md"
              className="!rounded-full !bg-white/10 hover:!bg-white/20"
              theme="dark"
              size="sm"
              icon={ArrowDownTrayIcon}
              onClick={() => { download && (window.location.href = download); }}
              testClassId="drive-preview-button-download"
            />
          </div>
        </div>
        <div
          className="grow relative overflow-hidden flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              close();
              history.push(RouterServices.generateRouteFromState({ companyId: company, itemId: '' }));
            }
          }}
        >
          <DriveDisplay />
        </div>
      </Transition>
    </Modal>
  );
};
DrivePreview.propTypes = {
  items: PropTypes.any.isRequired,
}
