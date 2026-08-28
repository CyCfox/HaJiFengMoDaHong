export const projectAsset = (path: string): string => {
  const relative = path.replace(/^assets\//, "");
  return `/${relative.split("/").map(encodeURIComponent).join("/")}`;
};
