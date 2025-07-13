/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCompanyApplications } from '@features/applications/hooks/use-company-applications';
import { Application } from '@features/applications/types/application';
import jwtStorageService from '@features/auth/jwt-storage-service';
import useRouterCompany from '@features/router/hooks/use-router-company';
import useRouterWorkspace from '@features/router/hooks/use-router-workspace';

type EditorType = {
  url?: string;
  is_url_file?: boolean;
  name?: string;
  app?: Application;
};

export const useEditors = (
  extension: string,
  options?: { preview_url?: string; editor_url?: string; editor_name?: string; url?: string },
) => {
  const workspaceId = useRouterWorkspace();
  const companyId = useRouterCompany();
  const { applications } = useCompanyApplications();
  const apps = applications.filter(
    app =>
      app.display?.tdrive?.files?.editor?.preview_url ||
      app.display?.tdrive?.files?.editor?.edition_url,
  );

  const preview_candidate: EditorType[] = [];
  const editor_candidate: EditorType[] = [];

  if (options?.preview_url) {
    preview_candidate.push({
      url: options?.preview_url,
    });
  }
  if (options?.editor_url) {
    editor_candidate.push({
      is_url_file: true,
      url: options?.editor_url,
      name: options?.editor_name || 'web link',
    });
  }

  //Primary exts
  apps.forEach(app => {
    if (
      (app.display?.tdrive?.files?.editor?.extensions || []).indexOf(
        ((extension || '') + (options?.url ? '.url' : '')).toLocaleLowerCase(),
      ) >= 0
    ) {
      if (app.display?.tdrive?.files?.editor?.edition_url) {
        editor_candidate.push({ app });
      }
      if (app.display?.tdrive?.files?.editor?.preview_url) {
        preview_candidate.push({
          url: app.display?.tdrive?.files?.editor?.preview_url,
          app: app,
        });
      }
    }
  });

  const openFile = (app: any, fileId: string, driveId: string) => {
    if (app.url && app.is_url_file) {
      window.open(app.url);
      return;
    }

    window.open(getFileUrl(app.display?.tdrive?.files?.editor?.edition_url, fileId, driveId));
  };

  const getPreviewUrl = (fileId: string): string => {
    return getFileUrl(preview_candidate?.[0]?.url as string, fileId);
  };

  const getFileUrl = (url: string, file_id: string, drive_id?: string): string => {
    const jwt = jwtStorageService.getJWT();

    if (!url) return '';
    
    // Vérifier si l'URL pointe vers le connecteur OnlyOffice et assurer le préfixe
    if (url.includes(':5000') || url.includes('connector')) {
      // Nettoyer complètement l'URL pour éviter les problèmes
      // Extraire uniquement le protocole et le domaine sans aucun paramètre ou chemin existant
      const urlParts = url.match(/^(https?:\/\/[^\/?#]+)/i);
      const baseUrl = urlParts ? urlParts[1] : url.split('?')[0].replace(/\/*$/, '');
      
      console.log('URL de base extraite:', baseUrl);
      
      // Déterminer si c'est pour une prévisualisation ou édition
      const isPreview = !drive_id && preview_candidate.length > 0 && preview_candidate[0].url === url;
      
      // Construire l'URL proprement
      url = `${baseUrl}/plugins/onlyoffice`;
      
      if (isPreview) {
        url += '?preview=1';
        console.log('URL de prévisualisation construite:', url);
      } else {
        console.log('URL d\'édition construite:', url);
      }
    }

    return `${url}${
      url.indexOf('?') > 0 ? '&' : '?'
    }token=${jwt}&workspace_id=${workspaceId}&company_id=${companyId}&file_id=${file_id}${
      drive_id ? `&drive_file_id=${drive_id}` : ''
    }`;
  };

  return { candidates: editor_candidate, openFile, getPreviewUrl };
};
