/**
 * @deprecated 請改用 training-source-manifest.ts；保留相容舊 import。
 */
export {
  TRAINING_SOURCE_SYSTEM as XTRAIL_SOURCE_SYSTEM,
  TRAINING_PARSEABLE_EXTENSIONS as XTRAIL_PARSEABLE_EXTENSIONS,
  TRAINING_REGISTER_ONLY_EXTENSIONS as XTRAIL_REGISTER_ONLY_EXTENSIONS,
  TRAINING_ALL_KNOWN_EXTENSIONS as XTRAIL_ALL_KNOWN_EXTENSIONS,
  TRAINING_IGNORE_PATH_FRAGMENTS as XTRAIL_IGNORE_PATH_FRAGMENTS,
  shouldIgnoreRelativePath,
  extensionOf,
  isParseableExtension,
  isKnownExtension,
  tagsFromRelativePath,
  mimeTypeForExtension,
  normalizeProductLine,
  COMMON_PRODUCT_LINE,
} from "./training-source-manifest";

import { allValidationQuestions } from "./training-product-registry";

/** @deprecated 請用 training-product-registry */
export const XTRAIL_VALIDATION_QUESTIONS = allValidationQuestions().map((x) => x.question);
