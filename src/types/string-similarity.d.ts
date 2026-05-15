declare module "string-similarity" {
  const stringSimilarity: {
    compareTwoStrings(first: string, second: string): number;
  };
  export default stringSimilarity;
}
