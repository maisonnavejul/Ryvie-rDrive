import { atom } from 'recoil';

export interface SyncProgressState {
  active: boolean;
  provider: string;
  current: number;
  total: number;
  currentFile: string;
  cancelled: boolean;
}

export const SyncProgressAtom = atom<SyncProgressState>({
  key: 'SyncProgressAtom',
  default: {
    active: false,
    provider: '',
    current: 0,
    total: 0,
    currentFile: '',
    cancelled: false,
  },
});
