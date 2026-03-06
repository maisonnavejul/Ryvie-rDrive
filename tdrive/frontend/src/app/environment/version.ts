declare const __APP_VERSION__: string;

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';

export default {
  version: appVersion,
  version_detail: appVersion,
  version_name: /* @VERSION_NAME */ 'rDrive',
};