import { TdriveServiceProvider } from "../../core/platform/framework";

export interface RcloneAPI extends TdriveServiceProvider {
  // Méthodes spécifiques à implémenter pour le service rclone
  getAuthUrl(): Promise<string>;
  listFiles(path: string): Promise<any[]>;
}
