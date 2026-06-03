import type { KnowledgeUnitRow, SourceAssetRow } from "@/lib/ingest/contracts/knowledge-unit-contract";

export type DiscoveredFile = {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  size: number;
};

export type AdapterParseResult = {
  units: KnowledgeUnitRow[];
  parseStatus: "ok" | "pending" | "failed" | "unsupported";
  parseError: string | null;
};

export interface SourceAdapter {
  readonly extensions: readonly string[];
  canHandle(extension: string): boolean;
  parse(file: DiscoveredFile, context: AdapterContext): Promise<AdapterParseResult>;
}

export type AdapterContext = {
  ingestBatchId: string;
  assetId: string;
  asset: SourceAssetRow;
  productLine: string;
  tags: string[];
  ingestedAt: string;
};
