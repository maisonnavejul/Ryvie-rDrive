import Api from '../../global/framework/api-service';
import {
  BrowseFilter,
  BrowsePaginate,
  BrowseQuery,
  BrowseSort,
  DriveItem,
  DriveItemDetails,
  DriveItemVersion,
} from '../types';
import Workspace from '@deprecated/workspaces/workspaces';
import Logger from 'features/global/framework/logger-service';
import { JWTDataType } from 'app/features/auth/jwt-storage-service';
import jwtStorageService from '@features/auth/jwt-storage-service';

export interface BaseSearchOptions {
  company_id?: string;
  workspace_id?: string;
  channel_id?: string;
  page_token?: string;
  limit?: number;
}

export type SearchDocumentsBody = {
  search?: string;
  company_id?: string;
  creator?: string;
  added?: string;
};
export type sharedWithMeFilterBody = {
  mime_type?: string;
  creator?: string;
};

let publicLinkToken: null | string = null;
let tdriveTabToken: null | string = null;

export const setPublicLinkToken = (token: string | null) => {
  publicLinkToken = token;
};

export const getPublicLinkToken = () => {
  return publicLinkToken;
};

export const setTdriveTabToken = (token: string | null) => {
  tdriveTabToken = token;
};

const appendTdriveToken = (useAnd?: boolean) => {
  if (tdriveTabToken) {
    return `${useAnd ? '&' : '?'}tdrive_tab_token=${tdriveTabToken}`;
  }
  return '';
};

export class DriveApiClient {
  private static logger = Logger.getLogger('MessageAPIClientService');

  static async getAnonymousToken(
    companyId: string,
    id: string,
    publicToken: string,
    password?: string,
  ) {
    return await Api.post<
      { company_id: string; document_id: string; token: string; token_password?: string },
      { access_token: JWTDataType }
    >(`/internal/services/documents/v1/companies/${companyId}/anonymous/token`, {
      company_id: companyId,
      document_id: id,
      token: publicToken,
      token_password: password,
    });
  }

  static async get(companyId: string, id: string | 'trash' | '') {
    return await Api.get<DriveItemDetails>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}${appendTdriveToken()}`,
    );
  }

  static async browse(
    companyId: string,
    id: string | 'trash' | '',
    filter: BrowseFilter,
    sort: BrowseSort,
    paginate: BrowsePaginate,
  ) {
    return await Api.post<BrowseQuery, DriveItemDetails>(
      `/internal/services/documents/v1/companies/${companyId}/browse/${id}${appendTdriveToken()}`,
      {
        filter,
        sort,
        paginate: {
          page_token: paginate.page.toString(),
          limitStr: paginate.limit.toString(),
        },
        nextPage: {
          page_token: paginate.nextPage?.page_token || '',
        },
      },
    );
  }

  static async remove(companyId: string, id: string | 'trash' | '') {
    return await Api.delete<void>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}${appendTdriveToken()}`,
    );
  }

  static async restore(companyId: string, id: string | 'trash' | '') {
    return await Api.post<any, any>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}/restore${appendTdriveToken()}`,
      {},
    );
  }

  static async update(companyId: string, id: string, update: Partial<DriveItem> & { is_update_access_to_share_link?: boolean }) {
    return await Api.post<Partial<DriveItem>, DriveItem>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}${appendTdriveToken()}`,
      update,
    );
  }

  static async create(
    companyId: string,
    data: { item: Partial<DriveItem>; version?: Partial<DriveItemVersion> },
  ) {
    if (!data.version) data.version = {} as Partial<DriveItemVersion>;

    return new Promise<DriveItem>((resolve, reject) => {
      Api.post<{ item: Partial<DriveItem>; version: Partial<DriveItemVersion> }, DriveItem>(
        `/internal/services/documents/v1/companies/${companyId}/item${appendTdriveToken()}`,
        data as { item: Partial<DriveItem>; version: Partial<DriveItemVersion> },
        res => {
          if ((res as any)?.statusCode || (res as any)?.error) {
            reject(res);
          }

          resolve(res);
        },
      );
    });
  }

  static async createVersion(companyId: string, id: string, version: Partial<DriveItemVersion>) {
    return await Api.post<Partial<DriveItemVersion>, DriveItemVersion>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}/version${appendTdriveToken()}`,
      version,
    );
  }

  static async checkMalware(companyId: string, id: string) {
    return await Api.post<any, DriveItem>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}/check_malware${appendTdriveToken()}`,
      {},
    );
  }

  static async reScan(companyId: string, id: string) {
    return await Api.post<any, DriveItem>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}/rescan${appendTdriveToken()}`,
      {},
    );
  }

  static getDownloadUrl(companyId: string, id: string, versionId?: string) {
    const jwt = jwtStorageService.getJWT();
    let url;
    
    if (versionId) {
      url = Api.route(`/internal/services/documents/v1/companies/${companyId}/item/${id}/download?version_id=${versionId}`);
    } else {
      url = Api.route(`/internal/services/documents/v1/companies/${companyId}/item/${id}/download`);
    }
    
    // Ajouter le token JWT à l'URL pour résoudre le problème d'authentification 401
    return `${url}${url.includes('?') ? '&' : '?'}token=${jwt}`;
  }

  static async getDownloadZipUrl(companyId: string, ids: string[], isDirectory?: boolean) {
    const jwt = jwtStorageService.getJWT();
    // Utiliser la méthode originale plutôt que de créer une nouvelle requête
    const url = Api.route(
      `/internal/services/documents/v1/companies/${companyId}/item/download/zip` +
        `?items=${ids.join(',')}&is_directory=${isDirectory || false}`,
    );
    
    // Ajouter le token JWT à l'URL pour résoudre le problème d'authentification 401
    const finalUrl = `${url}&token=${jwt}`;
    
    // Log pour debug
    Logger.debug('Download ZIP URL:', finalUrl);
    
    return finalUrl;
  }

  static async search(searchString: string, view?: string, options?: BaseSearchOptions) {
    const companyId = options?.company_id ? options.company_id : Workspace.currentGroupId;
    const query = `/internal/services/documents/v1/companies/${companyId}/search`;
    const searchData = {
      search: searchString,
      view: view,
    };
    const res = await Api.post<SearchDocumentsBody, { entities: DriveItem[] }>(query, searchData);
    this.logger.debug(
      `Drive search by text "${searchString}". Found`,
      res.entities.length,
      'drive item(s)',
    );

    return res;
  }

  static async sharedWithMe(filter?: any, options?: BaseSearchOptions) {
    const companyId = options?.company_id ? options.company_id : Workspace.currentGroupId;
    const query = `/internal/services/documents/v1/companies/${companyId}/shared-with-me`;
    const filterData = {
      mime_type: filter.mimeType,
      creator: filter.creator,
      view: 'shared_with_me',
    };
    const res = await Api.post<sharedWithMeFilterBody, { entities: DriveItem[] }>(
      query,
      filterData,
    );
    this.logger.debug(
      `Drive shared with me by filter "${JSON.stringify(filterData)}". Found`,
      res.entities.length,
      'drive item(s)',
    );

    return res;
  }

  static async updateLevel(companyId: string, id: string, update: any) {
    return await Api.post<any, any>(
      `/internal/services/documents/v1/companies/${companyId}/item/${id}${appendTdriveToken()}/level`,
      update,
    );
  }
}
