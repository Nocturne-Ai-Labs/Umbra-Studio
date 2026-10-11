import {mangaProjectAssets,type MangaAsset,type MangaProject} from './mangaModel';

export function appendMangaGeneratedOutput(project:MangaProject,projectId:string,requestId:string,path:string,asset:MangaAsset):{project:MangaProject;error?:string} {
  const request=project.generationRequests?.find(item=>item.requestId===requestId);
  if(project.id!==projectId || !request || request.received.includes(path))return {project};
  const assets=mangaProjectAssets(project);
  if(assets.length>=500)return {project,error:'The image tray is full. Remove an image to recover more generated options.'};
  const next={...project,assets:[...assets,asset],generationRequests:project.generationRequests?.map(item=>item.requestId===requestId ? {...item,received:[...item.received,path]} : item)};
  if(new Blob([JSON.stringify(next)]).size>100_000_000)return {project,error:'This generated image would exceed the 100 MB project limit. Remove unused art or split the book, then retry. The output remains in Gallery.'};
  return {project:next};
}
