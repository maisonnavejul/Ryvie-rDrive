import { Button } from '@atoms/button/button';
import { Modal, ModalContent } from '@atoms/modal';
import { Base } from '@atoms/text';
import { useDriveActions } from '@features/drive/hooks/use-drive-actions';
import { useDriveItem } from '@features/drive/hooks/use-drive-item';
import { DriveItemSelectedList } from '@features/drive/state/store';
import { DriveItem } from '@features/drive/types';
import { useEffect, useState } from 'react';
import { atom, useRecoilState } from 'recoil';
import RouterServices from '@features/router/services/router-service';
import Languages from '@features/global/services/languages-service';

export type ConfirmDeleteModalType = {
  open: boolean;
  items: DriveItem[];
};

export const ConfirmDeleteModalAtom = atom<ConfirmDeleteModalType>({
  key: 'ConfirmDeleteModalAtom',
  default: {
    open: false,
    items: [],
  },
});

export const ConfirmDeleteModal = () => {
  const [state, setState] = useRecoilState(ConfirmDeleteModalAtom);
    return (
        <>
            {state.items.length > 0 && (
                <Modal className="testid:confirm-delete-modal" open={state.open} onClose={() => setState({ ...state, open: false })}>
                    <ConfirmDeleteModalContent items={state.items} />
                </Modal>
            )}
        </>
    )
};

const ConfirmDeleteModalContent = ({ items }: { items: DriveItem[] }) => {
  const { item, refresh } = useDriveItem(items[0].id);
  const { remove } = useDriveActions();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useRecoilState(ConfirmDeleteModalAtom);
  const [, setSelected] = useRecoilState(DriveItemSelectedList);
  const { dirId, viewId } = RouterServices.getStateFromRoute();

  useEffect(() => {
    refresh(items[0].id);
  }, []);

  return (
    <ModalContent
      title={
        items.length === 1
          ? Languages.t('components.ConfirmDeleteModalContent_delete_item') + ` '${item?.name}'`
          : Languages.t('components.ConfirmDeleteModalContent_delete_items', [items.length])
      }
    >
      <Base className="block my-3">
        {Languages.t('components.ConfirmDeleteModalContent_delete_desc')}
      </Base>
      <br />
      <Button
        className="float-right"
        theme="danger"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          const ids = items.map((item) => item.id);
          await remove(ids, dirId || viewId || "");
          setLoading(false);
          setSelected({});
          setState({ ...state, open: false });
        }}
        testClassId="button-delete"
      >
        {Languages.t('components.ConfirmDeleteModalContent_delete')}
      </Button>
    </ModalContent>
  );
};
