import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const CATALOG_FILE_NAME = 'UmbraDanbooruTagsv1.csv';
const LEGACY_ALIAS_FILE_NAME = 'danbooru-tags.csv';

// Only exact stock files are replaced. User-edited catalogs are always preserved.
const LEGACY_STOCK_CATALOG_HASHES = new Set([
  'e4db1b196245bbc7e3e1f361b79a1c350e5814ddeefcde30fa7c3bd9ec4e774f',
  'e93330fa1ef3248aed43e845e4c36888941e964c7e446f46fa52b724c16352f8',
]);
const LEGACY_STOCK_ALIAS_HASHES = new Set([
  'bc393d0d905bdb814b6de25c6e2787d948685ad56ecb4c0760d0d294ff203600',
]);

export type DefaultDanbooruTagCatalogMigration = {
  action: 'installed' | 'replaced-stock' | 'current' | 'preserved-custom' | 'missing-bundled';
  bundledPath: string;
  userPath: string;
  removedLegacyAlias: boolean;
};

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function resolveBundledCatalog(sourceDir: string, runtimeRoot: string): string {
  const candidates = [
    join(sourceDir, 'defaults', 'PowerPrompter', 'CSV', 'tags', CATALOG_FILE_NAME),
    join(runtimeRoot, 'resources', 'app', 'defaults', 'PowerPrompter', 'CSV', 'tags', CATALOG_FILE_NAME),
    join(runtimeRoot, 'defaults', 'PowerPrompter', 'CSV', 'tags', CATALOG_FILE_NAME),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export function ensureDefaultDanbooruTagCatalog(input: {
  userDir: string;
  sourceDir: string;
  runtimeRoot: string;
  legacyStockCatalogHashes?: ReadonlySet<string>;
  legacyStockAliasHashes?: ReadonlySet<string>;
}): DefaultDanbooruTagCatalogMigration {
  const bundledPath = resolveBundledCatalog(input.sourceDir, input.runtimeRoot);
  const userPath = join(input.userDir, 'PowerPrompter', 'CSV', 'tags', CATALOG_FILE_NAME);
  const legacyAliasPath = join(dirname(userPath), LEGACY_ALIAS_FILE_NAME);

  if (!existsSync(bundledPath)) {
    return {
      action: 'missing-bundled',
      bundledPath,
      userPath,
      removedLegacyAlias: false,
    };
  }

  mkdirSync(dirname(userPath), { recursive: true });
  const bundledHash = hashFile(bundledPath);
  let action: DefaultDanbooruTagCatalogMigration['action'];

  if (!existsSync(userPath)) {
    copyFileSync(bundledPath, userPath);
    action = 'installed';
  } else {
    const userHash = hashFile(userPath);
    if (userHash === bundledHash) {
      action = 'current';
    } else if ((input.legacyStockCatalogHashes || LEGACY_STOCK_CATALOG_HASHES).has(userHash)) {
      copyFileSync(bundledPath, userPath);
      action = 'replaced-stock';
    } else {
      action = 'preserved-custom';
    }
  }

  let removedLegacyAlias = false;
  if (
    existsSync(legacyAliasPath)
    && (input.legacyStockAliasHashes || LEGACY_STOCK_ALIAS_HASHES).has(hashFile(legacyAliasPath))
  ) {
    rmSync(legacyAliasPath, { force: true });
    removedLegacyAlias = true;
  }

  return {
    action,
    bundledPath,
    userPath,
    removedLegacyAlias,
  };
}
