type UmbraImportMetaEnv = {
  DEV?: boolean;
  MODE?: string;
  UMBRA_DEV_MODE?: boolean | string;
};

const env = (import.meta as ImportMeta & { env?: UmbraImportMetaEnv }).env;

export const IS_UMBRA_DEV_MODE = env?.UMBRA_DEV_MODE === true
  || env?.UMBRA_DEV_MODE === 'true'
  || env?.DEV === true
  || env?.MODE === 'development';

