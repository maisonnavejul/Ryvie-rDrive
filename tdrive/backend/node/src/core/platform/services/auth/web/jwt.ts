import { FastifyPluginAsync, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import fp from "fastify-plugin";
import config from "../../../../config";
import { JwtType } from "../../types";
import { executionStorage } from "../../../framework/execution-storage";
import gr from "../../../../../services/global-resolver";
import { CrudException } from "../../../framework/api/crud-service";

const jwtPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  fastify.register(cookie);
  fastify.register(fastifyJwt, {
    secret: config.get("auth.jwt.secret") as string,
    cookie: {
      cookieName: "X-AuthToken",
      signed: false,
    },
  });

  const authenticate = async (request: FastifyRequest) => {
    request.log.info(`[AUTH] Cookies: ${JSON.stringify(request.cookies)}`);
    request.log.info(`[AUTH] Authorization header: ${request.headers.authorization}`);
    request.log.info(`[AUTH] Cookie header: ${request.headers.cookie}`);
    
    // Si le header Authorization n'est pas présent, essayer de copier le token depuis le cookie
    if (!request.headers.authorization && request.cookies && request.cookies['X-AuthToken']) {
      request.headers.authorization = `Bearer ${request.cookies['X-AuthToken']}`;
      request.log.info(`[AUTH] Using token from cookie X-AuthToken`);
    } else if (!request.headers.authorization) {
      request.log.error(`[AUTH] No Authorization header and no X-AuthToken cookie found`);
    }
    
    const jwt: JwtType = await request.jwtVerify();

    // Verify the SID exists and is valid except tokens for the public link
    if (!jwt.public_token_document_id && !jwt.application_id) {
      await gr.services.console.getClient().verifyJwtSid(jwt.sid);
    }

    if (jwt.type === "refresh") {
      // TODO  in the future we must invalidate the refresh token (because it should be single use)
    }

    request.currentUser = {
      ...{ email: jwt.email },
      ...{ id: jwt.sub },
      ...{ sid: jwt.sid },
      ...{ identity_provider_id: jwt.provider_id },
      ...{ application_id: jwt.application_id || null },
      ...{ server_request: jwt.server_request || false },
      ...{ allow_tracking: jwt.track || false },
      ...{ public_token_document_id: jwt.public_token_document_id || null },
    };

    executionStorage.getStore().user_id = request.currentUser.id;
    executionStorage.getStore().user_email = request.currentUser.email;

    request.log.debug(`Authenticated as user ${request.currentUser.id}`);
  };

  fastify.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await authenticate(request);
    } catch (err) {
      throw CrudException.unauthorized(`Bad credentials: ${err.message}`);
    }
  });

  fastify.decorate("authenticateOptional", async (request: FastifyRequest) => {
    try {
      await authenticate(request);
    } catch (err) {}
  });

};

export default fp(jwtPlugin, {
  name: "authenticate",
});
