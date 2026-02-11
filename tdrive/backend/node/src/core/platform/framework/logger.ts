import pino from "pino";
import { Configuration } from "./configuration";
import { executionStorage } from "./execution-storage";

const config = new Configuration("logger");

// Pino v9 has very strict log method signatures.
// Extend with permissive overloads so existing code compiles without changes.
export interface TdriveLogger extends pino.Logger {
  fatal(msg: string, ...args: any[]): void;
  fatal(obj: object, msg?: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  error(obj: object, msg?: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  warn(obj: object, msg?: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  info(obj: object, msg?: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  debug(obj: object, msg?: string, ...args: any[]): void;
  trace(msg: string, ...args: any[]): void;
  trace(obj: object, msg?: string, ...args: any[]): void;
}

export const logger: TdriveLogger = pino({
  name: "TdriveApp",
  level: config.get("level", "warn") || "warn",
  mixin() {
    const store = executionStorage.getStore();
    return store ? { ...store } : {};
  },
  formatters: {
    level(label: string) {
      return { level: label.toUpperCase() };
    },
  },
  serializers: pino.stdSerializers,
}) as TdriveLogger;

export const getLogger = (name?: string): TdriveLogger =>
  logger.child({ name: `tdrive${name ? "." + name : ""}` }) as TdriveLogger;

export const platformLogger = getLogger("platform");

export const messageQueueLogger = getLogger("message-queue");
