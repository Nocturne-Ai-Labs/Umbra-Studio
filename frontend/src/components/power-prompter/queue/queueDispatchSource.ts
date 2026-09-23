import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import type { PersistedQueueEditorSnapshot } from './queueCore';

/** A staged group keeps the card it was built from even if another card is now open. */
export function resolveQueueDispatchSource(
  snapshot: PersistedQueueEditorSnapshot | undefined,
  currentDocument: PowerPrompterCardDocument,
  currentFile: string | null,
): { document: PowerPrompterCardDocument; file: string | null } {
  return snapshot
    ? { document: snapshot.document, file: snapshot.sourceFile }
    : { document: currentDocument, file: currentFile };
}

export interface QueueBuildSourceMarker {
  file: string | null;
  documentSignature: string;
  fileLoadSequence: number;
}

export function hasQueueBuildSourceChanged(start: QueueBuildSourceMarker, current: QueueBuildSourceMarker): boolean {
  return start.file !== current.file
    || start.documentSignature !== current.documentSignature
    || start.fileLoadSequence !== current.fileLoadSequence;
}
