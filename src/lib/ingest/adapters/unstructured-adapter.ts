import type { AdapterParseResult, DiscoveredFile, SourceAdapter } from "./base-source-adapter";

/** PDF / PPT：Node 端僅登記 pending，由 Python parse job 處理 */
export const unstructuredAdapter: SourceAdapter = {
  extensions: [".pdf", ".pptx", ".ppt"],
  canHandle(ext: string) {
    return (this.extensions as readonly string[]).includes(ext);
  },
  async parse(_file: DiscoveredFile): Promise<AdapterParseResult> {
    return {
      units: [],
      parseStatus: "pending",
      parseError: null,
    };
  },
};
