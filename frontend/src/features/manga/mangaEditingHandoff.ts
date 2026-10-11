import {stageUmbraUiMediaHandoff,type UmbraUiMediaHandoffMode} from '@/lib/umbraUiMediaHandoff';
import {useStore} from '@/store/useStore';
import type {ImageMetadata} from '@/utils/metadata';
import type {MangaAsset,MangaProject} from './mangaModel';
import {saveMangaDraft} from './mangaPersistence';

export async function sendMangaImageToEditor(asset:MangaAsset,mode:Extract<UmbraUiMediaHandoffMode,'txt2img'|'img2img'|'inpaint'|'canvas'>,currentProject:()=>MangaProject) {
  // Stage embedded bytes so portable projects work after the original output moves.
  const response=await fetch('/api/manga/images/stage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageUrl:asset.imageUrl,provenance:asset.provenance})});
  const data=await response.json();if(!response.ok)throw new Error(data.error || 'The image could not be prepared for editing.');
  await saveMangaDraft(currentProject());
  await stageUmbraUiMediaHandoff({mode,path:data.path,originalSourcePath:data.path,name:asset.name,imageUrl:data.imageUrl,source:'manga-studio',...(asset.provenance ? {metadata:JSON.parse(asset.provenance.metadataJson) as ImageMetadata} : {})});
  useStore.getState().setActiveWorkspace('umbraui');
  if(new URLSearchParams(window.location.search).get('umbraPopout') === 'manga') {
    const url=new URL(window.location.href);url.searchParams.delete('umbraPopout');window.location.assign(url);
  }
}
