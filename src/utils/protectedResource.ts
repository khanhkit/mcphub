import type { Request } from 'express';
import config from '../config/index.js';
import type { SystemConfig } from '../types/index.js';
import { normalizeBasePath } from './basePath.js';
import { getInstallBaseUrlFromEnv, resolveInstallBaseUrl } from './installBaseUrl.js';

const METADATA_PATH = '/.well-known/oauth-protected-resource';

const getRequestOrigin = (req: Request): string | undefined => {
  const host = req.get?.('host') || req.headers?.host || req.headers?.[':authority'];
  return host ? `${req.protocol || 'http'}://${host}` : undefined;
};

const getRequestPath = (req: Request): string =>
  (req.originalUrl || req.path || '/').split('?')[0] || '/';

const stripPrefix = (path: string, prefix: string): string => {
  if (!prefix) return path;
  if (path === prefix) return '/';
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
};

const stripRequiredPrefix = (path: string, prefix: string): string | undefined => {
  if (!prefix) return path;
  if (path === prefix) return '/';
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : undefined;
};

const hasConfiguredPublicBaseUrl = (systemConfig?: SystemConfig | null): boolean =>
  Boolean(systemConfig?.install?.baseUrl?.trim() || getInstallBaseUrlFromEnv());

const getPublicPrefix = (baseUrl: URL, systemConfig?: SystemConfig | null): string =>
  hasConfiguredPublicBaseUrl(systemConfig)
    ? normalizeBasePath(baseUrl.pathname)
    : normalizeBasePath(config.basePath);

export const isProtectedTransportPath = (path: string): boolean => {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (
    normalized === '/mcp' ||
    normalized.startsWith('/mcp/') ||
    normalized === '/sse' ||
    normalized.startsWith('/sse/') ||
    normalized === '/messages'
  ) {
    return true;
  }

  return /^\/[^/]+\/(?:mcp(?:\/.*)?|sse(?:\/.*)?|messages)$/.test(normalized);
};

export const getPublicResourceUrl = (
  req: Request,
  systemConfig?: SystemConfig | null,
): string | undefined => {
  const baseUrlValue = resolveInstallBaseUrl(systemConfig, getRequestOrigin(req));
  if (!baseUrlValue) return undefined;

  const baseUrl = new URL(baseUrlValue);
  const runtimeBasePath = normalizeBasePath(config.basePath);
  const requestPath = stripPrefix(getRequestPath(req), runtimeBasePath);
  const publicPrefix = getPublicPrefix(baseUrl, systemConfig);

  return `${baseUrl.origin}${publicPrefix}${requestPath === '/' ? '' : requestPath}`;
};

export const getResourceMetadataUrl = (resourceUrl: string): string => {
  const resource = new URL(resourceUrl);
  return `${resource.origin}${METADATA_PATH}${resource.pathname}`;
};

export const getProtectedResourceUrlFromMetadataRequest = (
  req: Request,
  systemConfig?: SystemConfig | null,
): string | undefined => {
  const baseUrlValue = resolveInstallBaseUrl(systemConfig, getRequestOrigin(req));
  if (!baseUrlValue) return undefined;

  const baseUrl = new URL(baseUrlValue);
  if (!req.params?.resourcePath) {
    return baseUrlValue;
  }

  const requestPath = getRequestPath(req);
  if (requestPath === METADATA_PATH) {
    return baseUrlValue;
  }
  if (!requestPath.startsWith(`${METADATA_PATH}/`)) {
    return undefined;
  }

  const resourcePath = requestPath.slice(METADATA_PATH.length);
  const publicPrefix = getPublicPrefix(baseUrl, systemConfig);
  const transportPath = stripRequiredPrefix(resourcePath, publicPrefix);
  if (!transportPath || !isProtectedTransportPath(transportPath)) {
    return undefined;
  }

  return `${baseUrl.origin}${resourcePath}`;
};
