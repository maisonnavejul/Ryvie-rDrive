import { TdriveService, Prefix, ServiceName, Consumes } from '../../core/platform/framework';
import WebServerAPI from '../../core/platform/services/webserver/provider';
import { OAuthController } from '../oauth';

@ServiceName('oauth-service')
@Prefix('/api/v1/oauth')
@Consumes(['webserver'])
export default class OAuthServiceModule extends TdriveService<any> {
  version = '1';
  name = 'oauth-service';

  public async doInit(): Promise<this> {
    const fastify = this.context.getProvider<WebServerAPI>('webserver').getServer();
    const controller = new OAuthController();

    fastify.register((instance, _opts, next) => {
      controller.registerRoutes(instance, this.prefix);
      next();
    });

    return this;
  }

  api() {
    return {};
  }
}
