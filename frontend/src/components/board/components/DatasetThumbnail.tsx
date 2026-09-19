import { NsfwPrivacyShield, useNsfwPrivacy } from '@/components/privacy/NsfwPrivacyProvider';
import { datasetImageUrl, isProtectedDatasetImage } from '../datasetMedia';
import type { DatasetImage } from '../types';

export function DatasetThumbnail({ image, datasetName, conceptFolder, contain = false }: {
  image: DatasetImage;
  datasetName: string;
  conceptFolder: string;
  contain?: boolean;
}) {
  const { locked } = useNsfwPrivacy();
  const protectedMedia = isProtectedDatasetImage(image);
  return <>
    {!(locked && protectedMedia) && <img
      src={datasetImageUrl(datasetName, conceptFolder, image)}
      alt={image.filename}
      loading="lazy"
      data-umbra-nsfw-media={protectedMedia ? '' : undefined}
      className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`}
    />}
    <NsfwPrivacyShield protectedMedia={protectedMedia} compact />
  </>;
}
