import { ChevronDownIcon, ArrowPathIcon, Squares2X2Icon, ListBulletIcon, TrashIcon, EllipsisVerticalIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Button } from '@atoms/button/button';
import { Base, BaseSmall, Subtitle, Title } from '@atoms/text';
import Menu from '@components/menus/menu';
import { getFilesTree } from '@components/uploads/file-tree-utils';
import UploadZone from '@components/uploads/upload-zone';
import { setTdriveTabToken, DriveApiClient } from '@features/drive/api-client/api-client';
import { useDriveItem } from '@features/drive/hooks/use-drive-item';
import { useDriveUpload } from '@features/drive/hooks/use-drive-upload';
import { useDrivePrefetch } from '@features/drive/hooks/use-drive-prefetch';
import { DriveItemSelectedList, DriveItemSort, DriveNavigationState, DriveItemTypeFilter, DriveTypeFilter } from '@features/drive/state/store';
import { formatBytes } from '@features/drive/utils';
import useRouterCompany from '@features/router/hooks/use-router-company';
import useRouterWorkspace from '@features/router/hooks/use-router-workspace';
import JWTStorage from '@features/auth/jwt-storage-service';
import _ from 'lodash';
import { memo, Suspense, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { atomFamily, useRecoilState, useSetRecoilState, useRecoilValue } from 'recoil';
import { DrivePreview } from '../../viewer/drive-preview';
import {
  useOnBuildContextMenu,
  useOnBuildFileTypeContextMenu,
  useOnBuildPeopleContextMenu,
  useOnBuildDateContextMenu,
  useOnBuildSortContextMenu,
} from './context-menu';
import { DocumentRow, DocumentRowOverlay } from './documents/document-row';
import { useDrivePreview } from '@features/drive/hooks/use-drive-preview';
import { FolderRow } from './documents/folder-row';
import { FolderRowSkeleton, GallerySkeleton } from './documents/folder-row-skeleton';
import HeaderPath from './header-path';
import { ConfirmDeleteModal } from './modals/confirm-delete';
import { ConfirmTrashModal } from './modals/confirm-trash';
import { ConfirmDeleteModalAtom } from './modals/confirm-delete';
import { ConfirmTrashModalAtom } from './modals/confirm-trash';
import { CreateModalAtom } from './modals/create';
import { UploadModelAtom } from './modals/upload';
import { PropertiesModal } from './modals/properties';
import { AccessModal } from './modals/update-access';
import { SharedDriveModal } from './modals/shared-drive-access';
import { PublicLinkModal } from './modals/public-link';
import { VersionsModal } from './modals/versions';
import { UsersModal } from './modals/manage-users';
import { SharedFilesTable } from './shared-files-table';
import RouterServices from '@features/router/services/router-service';
import useRouteState from 'app/features/router/hooks/use-route-state';
import { SharedWithMeFilterState } from '@features/drive/state/shared-with-me-filter';
import MenusManager from '@components/menus/menus-manager.jsx';
import Languages from 'features/global/services/languages-service';
import { DndContext, useSensors, useSensor, PointerSensor, DragOverlay } from '@dnd-kit/core';
import { Droppable } from 'app/features/dragndrop/hook/droppable';
import { Draggable } from 'app/features/dragndrop/hook/draggable';
import { useDriveActions } from '@features/drive/hooks/use-drive-actions';
import { useCloudImport } from '@features/drive/hooks/use-cloud-import';
import { ConfirmModalAtom } from './modals/confirm-move/index';
import { useCurrentUser } from 'app/features/users/hooks/use-current-user';
import UserAPIClient from 'app/features/users/api/user-api-client';
import { ToasterService } from '@features/global/services/toaster-service';
import { ConfirmModal } from './modals/confirm-move';
import { useHistory } from 'react-router-dom';
import { SortIcon } from 'app/atoms/icons-agnostic';
import { useUploadExp } from 'app/features/files/hooks/use-exp-upload';
import GalleryView from './components/gallery-view';
import { hasSharedDriveAccess } from '@features/files/utils/access-info-helpers';
import { SyncProgressBar } from './components/sync-progress-bar';

export const DriveCurrentFolderAtom = atomFamily<
  string,
  { context?: string; initialFolderId: string }
>({
  key: 'DriveCurrentFolderAtom',
  default: options => options.initialFolderId || 'root',
});

export default memo(
  ({
    context,
    initialParentId,
    tdriveTabContextToken,
    inPublicSharing,
  }: {
    context?: string;
    initialParentId?: string;
    tdriveTabContextToken?: string;
    inPublicSharing?: boolean;
  }) => {
    const { user } = useCurrentUser();
    const companyId = useRouterCompany();
    const workspaceId = useRouterWorkspace();
    const history = useHistory();
    const role = user
      ? (user?.companies || []).find(company => company?.company.id === companyId)?.role
      : 'member';
    setTdriveTabToken(tdriveTabContextToken || null);
    const [filter] = useRecoilState(SharedWithMeFilterState);
    const { viewId, dirId, itemId } = useRouteState();
    const [sortLabel] = useRecoilState(DriveItemSort);
    const [parentId, _setParentId] = useRecoilState(
      DriveCurrentFolderAtom({
        context: context,
        initialFolderId: dirId || viewId || initialParentId || 'user_' + user?.id,
      }),
    );

    // set the initial view to the user's home directory
    useEffect(() => {
      !dirId &&
        !viewId &&
        history.push(RouterServices.generateRouteFromState({ viewId: parentId }));
    }, [viewId, dirId]);

    const [loadingParentChange, setLoadingParentChange] = useState(false);
    const navigationState = useRecoilValue(DriveNavigationState);
    
    const {
      sharedWithMe,
      details,
      access,
      item,
      inTrash,
      refresh,
      children,
      loading: loadingParent,
      path,
      loadNextPage,
      paginateItem,
    } = useDriveItem(parentId);
    const { uploadTree } = useDriveUpload();
    const { uploadTree: _uploadTree } = useUploadExp();
    
    // Activer le préchargement et la mise en cache pour une navigation fluide
    useDrivePrefetch();

    // Chargement optimisé : navigation instantanée + chargement des données
    const rawLoading = loadingParent || loadingParentChange;
    const isNavigatingInstantly = navigationState.isNavigating;
    
    // Mémoisation des items pour éviter les re-calculs coûteux
    const memoizedItems = useMemo(() => children || [], [children]);
    const itemsCount = memoizedItems.length;

    // Simple loading logic with minimum skeleton display time:
    // - hasLoadedOnce tracks if data arrived at least once for this parentId
    // - Once loaded, we never go back to loading/skeleton state (background refreshes are invisible)
    // - On navigation (parentId change), reset hasLoadedOnce so skeleton shows again
    // - Enforce minimum 300ms skeleton display to prevent flash
    const prevParentIdRef = useRef(parentId);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const skeletonStartTimeRef = useRef<number | null>(null);
    const shouldHideItems = prevParentIdRef.current !== parentId;
    
    useEffect(() => {
      if (prevParentIdRef.current !== parentId) {
        setHasLoadedOnce(false);
        skeletonStartTimeRef.current = Date.now(); // Start skeleton timer on navigation
        prevParentIdRef.current = parentId;
      }
    }, [parentId]);
    
    useEffect(() => {
      if (!rawLoading && !hasLoadedOnce) {
        // Enforce minimum skeleton display time (300ms)
        const skeletonStartTime = skeletonStartTimeRef.current;
        if (skeletonStartTime) {
          const elapsed = Date.now() - skeletonStartTime;
          const minDisplayTime = 300;
          if (elapsed < minDisplayTime) {
            // Wait for remaining time before marking as loaded
            const remaining = minDisplayTime - elapsed;
            setTimeout(() => {
              setHasLoadedOnce(true);
              skeletonStartTimeRef.current = null;
            }, remaining);
          } else {
            setHasLoadedOnce(true);
            skeletonStartTimeRef.current = null;
          }
        } else {
          setHasLoadedOnce(true);
        }
      }
    }, [rawLoading, hasLoadedOnce]);

    // loading is only true before the first successful load for this folder
    const loading = !hasLoadedOnce;
    
    
    // Filtre "fichiers partagés" pour Mon Drive
    const [showSharedOnly, setShowSharedOnly] = useState(false);
    const isMyDrive = viewId?.startsWith('user_') || parentId?.startsWith('user_');
    const [typeFilter] = useRecoilState(DriveItemTypeFilter);

    // Helper pour matcher un item selon le filtre de type
    const matchesTypeFilter = useCallback((item: any, filter: DriveTypeFilter): boolean => {
      if (!filter) return true;
      if (filter === 'folder') return item.is_directory;
      if (item.is_directory) return false; // Les autres filtres excluent les dossiers
      
      const ext = (item.extension || item.name?.split('.').pop() || '').toLowerCase();
      const mime = item.last_version_cache?.file_metadata?.mime || '';
      
      switch (filter) {
        case 'document':
          return ['doc', 'docx', 'odt', 'txt', 'rtf'].includes(ext) || mime.includes('document') || mime.includes('text');
        case 'spreadsheet':
          return ['xls', 'xlsx', 'ods', 'csv'].includes(ext) || mime.includes('spreadsheet');
        case 'presentation':
          return ['ppt', 'pptx', 'odp'].includes(ext) || mime.includes('presentation');
        case 'pdf':
          return ext === 'pdf' || mime === 'application/pdf';
        case 'image':
          return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext) || mime.startsWith('image/');
        case 'video':
          return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'].includes(ext) || mime.startsWith('video/');
        case 'audio':
          return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) || mime.startsWith('audio/');
        default:
          return true;
      }
    }, []);

    const visibleItems = useMemo(() => {
      let filtered = memoizedItems;
      
      // Filtre partagé
      if (showSharedOnly && isMyDrive) {
        filtered = filtered.filter(item => hasSharedDriveAccess(item));
      }
      
      // Filtre par type
      if (typeFilter) {
        filtered = filtered.filter(item => matchesTypeFilter(item, typeFilter));
      }
      
      return filtered;
    }, [memoizedItems, showSharedOnly, isMyDrive, typeFilter, matchesTypeFilter]);

    const uploadZone = 'drive_' + companyId;
    const uploadZoneRef = useRef<UploadZone | null>(null);

    const setCreationModalState = useSetRecoilState(CreateModalAtom);
    const setUploadModalState = useSetRecoilState(UploadModelAtom);

    const [checked, setChecked] = useRecoilState(DriveItemSelectedList);

    const setParentId = useCallback(
      async (id: string) => {
        setLoadingParentChange(true);
        try {
          await refresh(id);
          _setParentId(id);
        } catch (e) {
          console.error(e);
        }
        setLoadingParentChange(false);
      },
      [_setParentId],
    );

    useEffect(() => {
      setChecked({});
      refresh(parentId);
    }, [parentId, refresh, filter]);

    const items =
      item?.is_directory === false
        ? //We use this hack for public shared single file
          item
          ? [item]
          : []
        : children;

    const documents = items.filter(i => !i.is_directory);

    const selectedCount = Object.values(checked).filter(v => v).length;
    const selectedItems = useMemo(() => (children || []).filter(c => checked[c.id]), [children, checked]);

    const onBuildContextMenu = useOnBuildContextMenu(children, initialParentId, inPublicSharing);
    const onBuildSortContextMenu = useOnBuildSortContextMenu();

    const handleDragOver = (event: { preventDefault: () => void }) => {
      event.preventDefault();
    };
    const handleDrop = async (event: { dataTransfer: any; preventDefault: () => void }) => {
      event.preventDefault();
      const dataTransfer = event.dataTransfer;
      if (dataTransfer) {
        const tree = await getFilesTree(dataTransfer);
        setCreationModalState({ parent_id: '', open: false });
        await uploadTree(tree, {
          companyId,
          parentId,
        });
      }
    };

    const buildFileTypeContextMenu = useOnBuildFileTypeContextMenu();
    const buildPeopleContextMen = useOnBuildPeopleContextMenu();
    const buildDateContextMenu = useOnBuildDateContextMenu();
    const setConfirmModalState = useSetRecoilState(ConfirmModalAtom);
    const setConfirmDeleteModalState = useSetRecoilState(ConfirmDeleteModalAtom);
    const setConfirmTrashModalState = useSetRecoilState(ConfirmTrashModalAtom);
    const [activeIndex, setActiveIndex] = useState(null);
    const [activeChild, setActiveChild] = useState(null);
    const { update, download, downloadZip } = useDriveActions();
    const { importing: importingDropbox, importDropboxFolder } = useCloudImport();
    // État d'import séparé pour Google Drive
    const [importingGoogleDrive, setImportingGoogleDrive] = useState(false);
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
    );
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Marquee selection state — use refs to avoid re-renders during drag
    const isSelectingRef = useRef(false);
    const selectOriginRef = useRef<{ x: number; y: number } | null>(null);
    const rafIdRef = useRef<number>(0);
    const autoScrollRafRef = useRef<number>(0);
    const pointerRef = useRef<{ x: number; y: number } | null>(null);
    const drivePageRef = useRef<HTMLDivElement>(null);
    const [selectRect, setSelectRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);


    useEffect(() => {
      const updateSelectionFrame = () => {
        if (!isSelectingRef.current || !selectOriginRef.current || !pointerRef.current) {
          rafIdRef.current = 0;
          return;
        }
        const origin = selectOriginRef.current;
        const pointer = pointerRef.current;
        const left = Math.min(origin.x, pointer.x);
        const top = Math.min(origin.y, pointer.y);
        const width = Math.abs(pointer.x - origin.x);
        const height = Math.abs(pointer.y - origin.y);
        setSelectRect({ left, top, width, height });
        const container = scrollViewer.current;
        if (!container) {
          rafIdRef.current = 0;
          return;
        }
        const rect = new DOMRect(left, top, width, height);
        const elements = container.querySelectorAll('[id^="DR-"]');
        const nextChecked: Record<string, boolean> = {};
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i] as HTMLElement;
          const elRect = el.getBoundingClientRect();
          if (!(rect.right < elRect.left || rect.left > elRect.right || rect.bottom < elRect.top || rect.top > elRect.bottom)) {
            nextChecked[el.id.slice(3)] = true;
          }
        }
        setChecked(nextChecked);
        rafIdRef.current = 0;
      };

      const runAutoScroll = () => {
        if (!isSelectingRef.current || !pointerRef.current) {
          autoScrollRafRef.current = 0;
          return;
        }
        const container = scrollViewer.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const threshold = 56;
          const maxSpeed = 22;
          let delta = 0;
          if (pointerRef.current.y < containerRect.top + threshold) {
            const ratio = Math.min(1, (containerRect.top + threshold - pointerRef.current.y) / threshold);
            delta = -Math.ceil(maxSpeed * ratio);
          } else if (pointerRef.current.y > containerRect.bottom - threshold) {
            const ratio = Math.min(1, (pointerRef.current.y - (containerRect.bottom - threshold)) / threshold);
            delta = Math.ceil(maxSpeed * ratio);
          }
          if (delta !== 0) {
            container.scrollTop += delta;
            if (!rafIdRef.current) {
              rafIdRef.current = requestAnimationFrame(updateSelectionFrame);
            }
          }
        }
        autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isSelectingRef.current || !selectOriginRef.current) return;
        pointerRef.current = { x: e.clientX, y: e.clientY };
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(updateSelectionFrame);
        }
        if (!autoScrollRafRef.current) {
          autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
        }
      };
      const onMouseUp = () => {
        if (!isSelectingRef.current) return;
        isSelectingRef.current = false;
        selectOriginRef.current = null;
        pointerRef.current = null;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
        rafIdRef.current = 0;
        autoScrollRafRef.current = 0;
        setSelectRect(null);
      };
      const onWindowMouseDown = (e: MouseEvent) => {
        if (isMobile) return;
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const drivePage = drivePageRef.current;
        if (!drivePage || !drivePage.contains(target)) return;
        const inItem = target.closest('[id^="DR-"]');
        if (inItem) return;
        const inInteractive = target.closest('button, input, select, textarea, a, [role="menu"], [role="dialog"], .modal');
        if (inInteractive) return;
        setChecked({});
        isSelectingRef.current = true;
        selectOriginRef.current = { x: e.clientX, y: e.clientY };
        pointerRef.current = { x: e.clientX, y: e.clientY };
        setSelectRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
        e.preventDefault();
      };
      window.addEventListener('mousedown', onWindowMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousedown', onWindowMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
      };
    }, [isMobile, setChecked]);

    function getItemFromDndData(data: any): any {
      // Support explicit item field (new) or child.props.item (legacy)
      return data?.item || data?.child?.props?.item;
    }
    function handleDragStart(event: any) {
      setActiveIndex(event.active.id);
      setActiveChild(getItemFromDndData(event.active.data.current));
    }
    function handleDragEnd(event: any) {
      setActiveIndex(null);
      setActiveChild(null);
      if (event.over) {
        const draggedItem = getItemFromDndData(event.active.data.current);
        const targetFolderId = inTrash ? 'root' : getItemFromDndData(event.over.data.current)?.id;

        if (!draggedItem || !targetFolderId) return;

        // Prevent dropping a folder into itself
        if (draggedItem.id === targetFolderId) return;

        // Collect all items to move: if dragged item is checked, move all checked items
        const checkedIds = Object.keys(checked).filter(id => checked[id]);
        const isDraggedChecked = checkedIds.includes(draggedItem.id);
        const itemsToMove = isDraggedChecked && checkedIds.length > 1
          ? checkedIds.map(id => {
              const found = children.find(c => c.id === id) || items.find(c => c.id === id);
              return found || { id, name: id, parent_id: draggedItem.parent_id };
            })
          : [draggedItem];

        const title = itemsToMove.length > 1
          ? Languages.t('components.item_context_menu.move.modal_header') + ` ${itemsToMove.length} éléments`
          : Languages.t('components.item_context_menu.move.modal_header') + ` '${draggedItem.name}'`;

        setConfirmModalState({
          open: true,
          parent_id: targetFolderId,
          mode: 'move',
          title,
          onSelected: async ids => {
            for (const item of itemsToMove) {
              await update(
                { parent_id: ids[0] },
                item.id,
                item.parent_id || draggedItem.parent_id,
              );
            }
            // Clear selection after move
            setChecked({});
          },
        });
      }
    }

    function draggableMarkup(index: number, child: any) {
      const ext = (child.extension || child.name?.split('.').pop() || '').toLowerCase();
      const isOffice = officeExtensions.has(ext);
      const commonProps = {
        key: index,
        className:
          (index === 0 ? 'rounded-t-md ' : '-mt-px ') +
          (index === items.length - 1 ? 'rounded-b-md ' : '') +
          'border-0 md:border',
        item: child,
        checked: checked[child.id] || false,
        onCheck: (v: boolean) => setChecked(_.pickBy({ ...checked, [child.id]: v }, _.identity)),
        onBuildContextMenu: () => onBuildContextMenu(details, child),
        inPublicSharing,
        ...(isOffice ? { onClick: () => openOnlyOfficeEditor(child) } : {}),
      };
      return isMobile ? (
        <DocumentRow {...commonProps} />
      ) : (
        <Draggable id={index} key={index}>
          <DocumentRow {...commonProps} />
        </Draggable>
      );
    }

    // Scroll container ref
    const scrollViewer = useRef<HTMLDivElement>(null);

    // Scroll to item in view
    const scrollTillItemInView = itemId && itemId?.length > 0;
    const scrollItemId = itemId || '';

    useEffect(() => {
      const itemInChildren = children.find(item => item.id === scrollItemId);
      if (!loading && scrollTillItemInView && !itemInChildren) {
        scrollViewer.current?.scrollTo(0, scrollViewer.current?.scrollHeight);
      } else {
        if (!loading && itemInChildren) {
          // scroll to preview item using id for current preview routes
          const element = document.getElementById(`DR-${scrollItemId}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // set it as checked to indicate it is in view
          setChecked({ [scrollItemId]: true });
        }
      }
    }, [loading, children]);


    const [isPreparingUpload, setIsPreparingUpload] = useState(false);
    
    // Mémoisation des handlers de boutons pour éviter les re-renders coûteux
    const uploadItemModal = useCallback(() => {
      if (item?.id) setUploadModalState({ open: true, parent_id: item.id });
    }, [item?.id, setUploadModalState]);
    
    const handleUploadPrepare = useCallback(() => {
      setIsPreparingUpload(true);
    }, []);
    
    const handleUploadComplete = useCallback(() => {
      setIsPreparingUpload(false);
    }, []);
    

    
    // Lazy loading des boutons pour éviter le rendu coûteux
    const [buttonsVisible, setButtonsVisible] = useState(false);
    
    useEffect(() => {
      // Délai minimal pour afficher les boutons après le rendu principal
      const timer = setTimeout(() => setButtonsVisible(true), 0);
      return () => clearTimeout(timer);
    }, []);

    // Détecter si on est dans une vue Dropbox
    const isDropboxView = parentId?.startsWith('dropbox_');
    
    // Détecter si on est dans une vue Google Drive
    const isGoogleDriveView = parentId?.startsWith('googledrive_');
    
    // Helper: find or create a dedicated sync folder inside Mon Drive
    const findOrCreateSyncFolder = useCallback(async (folderName: string): Promise<string> => {
      const myDriveId = 'user_' + user?.id;
      console.log(`🔍 findOrCreateSyncFolder: looking for "${folderName}" in Mon Drive (${myDriveId})`);
      
      // Browse Mon Drive to find existing folder
      try {
        const details = await DriveApiClient.browse(companyId, myDriveId, { company_id: companyId }, { by: 'date', order: 'desc' }, { page: 0, limit: 200, nextPage: { page_token: '' } });
        const allChildren = details?.children || [];
        const allFolders = allChildren.filter((c: any) => c.is_directory);
        
        console.log(`📂 Mon Drive contains ${allChildren.length} items (${allFolders.length} folders):`);
        allFolders.forEach((f: any) => console.log(`  📁 "${f.name}" (id: ${f.id})`));
        
        const existing = allFolders.find(
          (c: any) => c.name === folderName
        );
        
        if (existing) {
          console.log(`✅ Found existing sync folder: "${existing.name}" (id: ${existing.id})`);
          
          // Vérifier le contenu du dossier trouvé
          try {
            const folderContent = await DriveApiClient.browse(companyId, existing.id, { company_id: companyId }, { by: 'date', order: 'desc' }, { page: 0, limit: 200, nextPage: { page_token: '' } });
            const folderChildren = folderContent?.children || [];
            console.log(`📂 Sync folder "${existing.name}" contains ${folderChildren.length} items:`);
            folderChildren.forEach((item: any) => console.log(`  ${item.is_directory ? '📁' : '📄'} "${item.name}" (id: ${item.id})`));
          } catch (e) {
            console.warn('Could not browse sync folder content:', e);
          }
          
          return existing.id;
        }
        
        console.log(`⚠️ No folder named "${folderName}" found in Mon Drive, creating...`);
      } catch (e) {
        console.warn('Could not browse Mon Drive to find sync folder:', e);
      }
      
      // Create the folder
      const created = await DriveApiClient.create(companyId, {
        item: {
          company_id: companyId,
          workspace_id: 'drive',
          parent_id: myDriveId,
          name: folderName,
          is_directory: true,
        },
      });
      console.log(`✅ Created new sync folder: "${folderName}" (id: ${created.id})`);
      return created.id;
    }, [user?.id, companyId]);

    // Fonction pour synchroniser les fichiers Dropbox
    const handleDropboxSync = useCallback(async () => {
      if (!isDropboxView) return;
      
      const dropboxPath = parentId === 'dropbox_root' ? '' : parentId.replace('dropbox_', '').replace(/_/g, '/');
      
      try {
        const syncFolderId = await findOrCreateSyncFolder('Dropbox');
        await importDropboxFolder(dropboxPath, syncFolderId);
      } catch (error) {
        console.error('Erreur lors de la synchronisation Dropbox:', error);
      }
    }, [isDropboxView, parentId, importDropboxFolder, findOrCreateSyncFolder]);
    
    // Fonction pour synchroniser les fichiers Google Drive
    const handleGoogleDriveSync = useCallback(async () => {
      if (!isGoogleDriveView || importingGoogleDrive) return;
      
      const googleDrivePath = parentId === 'googledrive_root' ? '' : parentId.replace('googledrive_', '').replace(/_/g, '/');
      
      setImportingGoogleDrive(true);
      try {
        const syncFolderId = await findOrCreateSyncFolder('Google Drive');
        await importDropboxFolder(googleDrivePath, syncFolderId, { provider: 'googledrive' });
      } catch (error) {
        console.error('Erreur lors de la synchronisation Google Drive:', error);
      } finally {
        setImportingGoogleDrive(false);
      }
    }, [isGoogleDriveView, parentId, importDropboxFolder, importingGoogleDrive, findOrCreateSyncFolder]);

    // View mode: list (default) or gallery, persisted per user
    const viewModeKey = `drive_view_mode_${user?.id || 'default'}`;
    const [viewMode, setViewMode] = useState<'list' | 'gallery'>(() => {
      const fromPrefs = user?.preferences?.drive_view_mode;
      if (fromPrefs === 'gallery' || fromPrefs === 'list') return fromPrefs;
      try {
        const saved = localStorage.getItem(viewModeKey);
        return (saved === 'gallery' || saved === 'list') ? (saved as 'list' | 'gallery') : 'list';
      } catch {
        return 'list';
      }
    });

    // Sync viewMode when user changes (account switch)
    const prevUserIdRef = useRef(user?.id);
    useEffect(() => {
      if (user?.id && user.id !== prevUserIdRef.current) {
        prevUserIdRef.current = user.id;
        const key = `drive_view_mode_${user.id}`;
        const fromPrefs = user?.preferences?.drive_view_mode;
        if (fromPrefs === 'gallery' || fromPrefs === 'list') {
          setViewMode(fromPrefs);
        } else {
          try {
            const saved = localStorage.getItem(key);
            if (saved === 'gallery' || saved === 'list') setViewMode(saved);
          } catch {}
        }
      }
    }, [user?.id, user?.preferences?.drive_view_mode]);

    // Persist viewMode changes
    const viewModeRef = useRef(viewMode);
    useEffect(() => {
      if (viewModeRef.current === viewMode) return;
      viewModeRef.current = viewMode;
      try { localStorage.setItem(viewModeKey, viewMode); } catch {}
      UserAPIClient.setUserPreferences({ drive_view_mode: viewMode });
    }, [viewMode, viewModeKey]);

    const { open: openPreview } = useDrivePreview();

    // Extensions that should open directly in OnlyOffice editor
    const officeExtensions = new Set(['docx', 'doc', 'odt', 'xlsx', 'xls', 'ods', 'pptx', 'ppt', 'odp']);

    const openOnlyOfficeEditor = useCallback((item: any) => {
      const jwt = JWTStorage.getJWT();
      // @ts-ignore
      const connectorUrl = (window.APP_CONFIG?.ONLYOFFICE_CONNECTOR_URL) || import.meta.env.VITE_ONLYOFFICE_CONNECTOR_URL || `${window.location.protocol}//${window.location.host}`;
      const fileId = item.last_version_cache?.file_metadata?.external_id || '';
      const driveFileId = item.id;
      const url = `${connectorUrl}/plugins/onlyoffice?token=${jwt}&workspace_id=${workspaceId}&company_id=${companyId}&file_id=${fileId}&drive_file_id=${driveFileId}`;
      window.open(url, '_blank');
    }, [workspaceId, companyId]);

    const openFileItem = useCallback((item: any) => {
      const ext = (item.extension || item.name?.split('.').pop() || '').toLowerCase();
      if (officeExtensions.has(ext)) {
        openOnlyOfficeEditor(item);
      } else {
        openPreview(item);
        history.push(RouterServices.generateRouteFromState({ companyId, itemId: item.id }));
      }
    }, [openOnlyOfficeEditor, openPreview, history, companyId]);


    return (
      <>
        {viewId == 'shared-with-me' ? (
          <>
            <Suspense fallback={<></>}>
              <DrivePreview items={documents} />
            </Suspense>
            <SharedFilesTable />
          </>
        ) : (
          <div ref={drivePageRef} className="h-full">
          <UploadZone
            overClassName={''}
            className="h-full overflow-hidden"
            disableClick
            parent={''}
            multiple={true}
            allowPaste={true}
            ref={uploadZoneRef}
            driveCollectionKey={uploadZone}
            onPrepareUpload={handleUploadPrepare}
            onFinishUpload={handleUploadComplete}
            onAddFiles={async (_, event) => {
              const tree = await getFilesTree(event);
              setCreationModalState({ parent_id: '', open: false });
              await uploadTree(tree, {
                companyId,
                parentId,
              });
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            disabled={inTrash || access === 'read'}
            testClassId="browser-upload-zone"
          >
            {role == 'admin' && <UsersModal />}
            <VersionsModal />
            <AccessModal />
            <SharedDriveModal />
            <PublicLinkModal />
            <PropertiesModal />
            <ConfirmDeleteModal />
            <ConfirmTrashModal />
            <ConfirmModal />
            <SyncProgressBar />
            <Suspense fallback={<></>}>
              <DrivePreview items={documents} />
            </Suspense>
            <div
              className="flex flex-col grow h-full overflow-hidden"
            >
              <div
                className={`flex flex-row shrink-0 items-center mb-4 ${
                  viewId !== 'shared_with_me' ? 'flex-wrap' : ''
                } border-b md:border-b-0 px-4 py-2 md:px-0 md:py-0`}
              >
                {viewId === 'shared_with_me' ? (
                  <div>
                    <Title className="mb-4 block">
                      {Languages.t('scenes.app.shared_with_me.shared_with_me')}
                    </Title>
                    {/* Filters */}
                    <div className="flex items-center space-x-4 mb-6">
                      <div className="">
                        <Button
                          theme="secondary"
                          className="flex items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-3 py-2 rounded-lg shadow-sm"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildFileTypeContextMenu(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                              undefined,
                              'browser-share-with-me-menu-file-type',
                            );
                          }}
                          testClassId="button-open-menu-file-type"
                        >
                          <span>
                            {filter.mimeType.key && filter.mimeType.key != 'All'
                              ? filter.mimeType.key
                              : Languages.t('scenes.app.shared_with_me.file_type')}
                          </span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          theme="secondary"
                          className="flex items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-3 py-2 rounded-lg shadow-sm"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildPeopleContextMen(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                              undefined,
                              'browser-share-with-me-menu-people',
                            );
                          }}
                          testClassId="button-open-menu-people"
                        >
                          <span>{Languages.t('scenes.app.shared_with_me.people')}</span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          theme="secondary"
                          className="flex items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-3 py-2 rounded-lg shadow-sm"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildDateContextMenu(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                              undefined,
                              'browser-share-with-me-menu-last-modified',
                            );
                          }}
                          testClassId="button-open-menu-last-modified"
                        >
                          <span>
                            {filter.date.key && filter.date.key != 'All'
                              ? filter.date.key
                              : Languages.t('scenes.app.shared_with_me.last_modified')}
                          </span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <HeaderPath
                    path={path || []}
                    inTrash={inTrash}
                    setParentId={setParentId}
                    inPublicSharing={inPublicSharing}
                  />
                )}
                <div className="grow" />

                {access !== 'read' && (
                  <BaseSmall className="hidden md:block">
                    {formatBytes(item?.size || 0)} {Languages.t('scenes.app.drive.used')}
                  </BaseSmall>
                )}

                {buttonsVisible && (
                  <Menu
                    menu={() => onBuildSortContextMenu(isMyDrive, showSharedOnly, setShowSharedOnly)}
                    sortData={sortLabel}
                    testClassId="browser-menu-sorting"
                  >
                    {' '}
                    <Button
                    theme="outline"
                    className="ml-4 flex flex-row items-center border-0 md:border !text-gray-500 md:!text-blue-500 px-0 md:px-4"
                    testClassId="button-sorting"
                  >
                    <SortIcon
                      className={`h-4 w-4 mr-2 -ml-1 ${
                        sortLabel.order === 'asc' ? 'transform rotate-180' : ''
                      }`}
                    />
                    <span>
                      {Languages.t('components.item_context_menu.sorting.selected.' + sortLabel.by)}
                    </span>
                    <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                    </Button>
                  </Menu>
                )}
                {buttonsVisible && (
                  <Button
                    theme="outline"
                    className="ml-2 flex flex-row items-center border-0 md:border !text-gray-500 md:!text-blue-500 px-2 md:px-3"
                    onClick={() => setViewMode(v => (v === 'list' ? 'gallery' : 'list'))}
                    testClassId="button-toggle-view"
                  >
                    {viewMode === 'list' ? (
                      <>
                        <Squares2X2Icon className="h-4 w-4 mr-2 -ml-1" />
                        <span>Galerie</span>
                      </>
                    ) : (
                      <>
                        <ListBulletIcon className="h-4 w-4 mr-2 -ml-1" />
                        <span>Liste</span>
                      </>
                    )}
                  </Button>
                )}

                {/* Bulk actions when selection exists */}
                {selectedCount > 0 && buttonsVisible && (
                  <>
                    <Button
                      theme={'secondary'}
                      className="ml-2 flex flex-row items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-2 md:px-3 shadow-sm"
                      onClick={() => {
                        if (selectedCount === 1) {
                          const item = selectedItems[0];
                          if (item.is_directory) {
                            downloadZip([item.id]);
                          } else {
                            download(item.id);
                          }
                        } else {
                          downloadZip(selectedItems.map(i => i.id));
                        }
                      }}
                      testClassId="button-bulk-download"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-2 -ml-1" />
                      <span>Télécharger</span>
                    </Button>

                    <Button
                      theme={'secondary'}
                      className="ml-2 flex flex-row items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-red-600 dark:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-950/30 px-2 md:px-3 shadow-sm"
                      disabled={access !== 'manage'}
                      onClick={() => {
                        if (inTrash) {
                          setConfirmDeleteModalState({ open: true, items: selectedItems as any });
                        } else {
                          setConfirmTrashModalState({ open: true, items: selectedItems as any });
                        }
                      }}
                      testClassId="button-bulk-delete"
                    >
                      <TrashIcon className="h-4 w-4 mr-2 -ml-1" />
                      <span>{inTrash ? 'Supprimer' : 'Corbeille'}</span>
                    </Button>

                    <Menu menu={() => onBuildContextMenu(details, selectedCount === 1 ? selectedItems[0] : undefined)} testClassId="browser-menu-bulk-actions">
                      <Button
                        theme="secondary"
                        className="ml-2 flex flex-row items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-2 md:px-3 shadow-sm"
                        testClassId="button-bulk-actions"
                      >
                        <EllipsisVerticalIcon className="h-5 w-5" />
                      </Button>
                    </Menu>
                  </>
                )}
                
                {/* Bouton de synchronisation Dropbox */}
                {isDropboxView && buttonsVisible && (
                  <Button
                    theme="outline"
                    className="ml-4 flex flex-row items-center border-0 md:border !text-gray-500 md:!text-blue-500 px-0 md:px-4"
                    onClick={handleDropboxSync}
                    disabled={importingDropbox}
                    testClassId="button-dropbox-sync"
                  >
                    <ArrowPathIcon 
                      className={`h-4 w-4 mr-2 -ml-1 ${importingDropbox ? 'animate-spin' : ''}`} 
                    />
                    <span>
                      {importingDropbox ? 'Synchronisation...' : 'Synchroniser avec Mon drive'}
                    </span>
                  </Button>
                )}
                
                {/* Bouton de synchronisation Google Drive */}
                {isGoogleDriveView && buttonsVisible && (
                  <Button
                    theme="outline"
                    className="ml-4 flex flex-row items-center border-0 md:border !text-gray-500 md:!text-blue-500 px-0 md:px-4"
                    onClick={handleGoogleDriveSync}
                    disabled={importingGoogleDrive}
                    testClassId="button-googledrive-sync"
                  >
                    <ArrowPathIcon 
                      className={`h-4 w-4 mr-2 -ml-1 ${importingGoogleDrive ? 'animate-spin' : ''}`} 
                    />
                    <span>
                      {importingGoogleDrive ? 'Synchronisation...' : 'Synchroniser avec Mon drive'}
                    </span>
                  </Button>
                )}
                
                {viewId !== 'shared_with_me' && viewId !== 'root' && buttonsVisible && (
                  <Menu menu={() => onBuildContextMenu(details)} testClassId="browser-menu-more">
                    {' '}
                    <Button
                      theme="secondary"
                      className="ml-4 flex flex-row items-center border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 hover:!bg-zinc-50 dark:hover:!bg-zinc-800 px-3 md:px-4 shadow-sm"
                      testClassId="button-more"
                    >
                      <span>
                        {selectedCount > 1
                          ? `${selectedCount} items`
                          : Languages.t('scenes.app.drive.context_menu')}{' '}
                      </span>

                      <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                    </Button>
                  </Menu>
                )}
              </div>

              <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
                <div className="grow overflow-auto relative" ref={scrollViewer}>
                  {/* Skeleton pendant le chargement initial (adapté au mode d'affichage) */}
                  {loading && itemsCount === 0 && !hasLoadedOnce && (
                    viewMode === 'gallery' ? <GallerySkeleton /> : <FolderRowSkeleton />
                  )}
                  {itemsCount === 0 && !loading && hasLoadedOnce && (
                    <div className="mt-4 text-center border-2 border-dashed rounded-md p-8">
                      <Subtitle className="block mb-2">
                        {Languages.t('scenes.app.drive.nothing')}
                      </Subtitle>
                      {!inTrash && access != 'read' && (
                        <>
                          <Base>{Languages.t('scenes.app.drive.drag_and_drop')}</Base>
                          <br />
                          <Button
                            onClick={() => uploadItemModal()}
                            theme={isPreparingUpload ? 'outline' : 'primary'}
                            className="mt-4"
                            loading={isPreparingUpload}
                            disabled={isPreparingUpload}
                            testClassId="button-add-doc"
                          >
                            {Languages.t('scenes.app.drive.add_doc')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {viewMode === 'gallery' ? (
                    !shouldHideItems && (
                      <GalleryView
                        items={visibleItems as any}
                        checked={checked}
                        onCheck={(id, v) => setChecked(_.pickBy({ ...checked, [id]: v }, _.identity))}
                        buildContextMenu={(it: any) => onBuildContextMenu(details, it)}
                        onOpenFolder={(id: string) => {
                          const route = RouterServices.generateRouteFromState({ dirId: id });
                          history.push(route);
                          if (inPublicSharing) return setParentId(id);
                        }}
                        onOpenFile={(id: string) => {
                          const it = children.find(c => c.id === id) || items.find(c => c.id === id);
                          if (it && !it.is_directory) {
                            openFileItem(it);
                          }
                        }}
                        onContextMenu={(it: any, evt: React.MouseEvent) => {
                          evt.preventDefault();
                          onBuildContextMenu(details, it);
                        }}
                      />
                    )
                  ) : (
                    !shouldHideItems && (
                      <>
                        {visibleItems.map((child, index) =>
                        child.is_directory ? (
                          <Droppable id={index} key={index} data={{ item: child }}>
                            <Draggable id={index} data={{ item: child }}>
                              <FolderRow
                                className={
                                  (index === 0 ? 'rounded-t-md ' : '-mt-px ') +
                                  (index === visibleItems.length - 1 ? 'rounded-b-md ' : '') +
                                  'border-0 md:border'
                                }
                                item={child}
                                onClick={() => {
                                  const route = RouterServices.generateRouteFromState({
                                    dirId: child.id,
                                  });
                                  history.push(route);
                                  if (inPublicSharing) return setParentId(child.id);
                                }}
                                checked={checked[child.id] || false}
                                onCheck={v =>
                                  setChecked(_.pickBy({ ...checked, [child.id]: v }, _.identity))
                                }
                                onBuildContextMenu={() => onBuildContextMenu(details, child)}
                              />
                            </Draggable>
                          </Droppable>
                        ) : (
                          draggableMarkup(index, child)
                        ),
                      )}
                      </>
                    )
                  )}
                  <DragOverlay>
                    {activeIndex ? (
                      <div className="relative">
                        <DocumentRowOverlay
                          className={
                            (activeIndex === 0 ? 'rounded-t-md ' : '-mt-px ') +
                            (activeIndex === items.length - 1 ? 'rounded-b-md ' : '')
                          }
                          item={activeChild}
                        ></DocumentRowOverlay>
                        {(() => {
                          const checkedIds = Object.keys(checked).filter(id => checked[id]);
                          const count = activeChild && checkedIds.includes(activeChild.id) ? checkedIds.length : 1;
                          return count > 1 ? (
                            <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-md z-50">
                              {count}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                  </DragOverlay>
                  {selectRect && (
                    <div
                      style={{
                        position: 'fixed',
                        left: selectRect.left,
                        top: selectRect.top,
                        width: selectRect.width,
                        height: selectRect.height,
                        border: '1px dashed rgba(59,130,246,0.9)',
                        background: 'rgba(59,130,246,0.12)',
                        pointerEvents: 'none',
                        zIndex: 50,
                      }}
                    />
                  )}
                </div>
              </DndContext>
            </div>
          </UploadZone>
          </div>
        )}
      </>
    );
  },
);
