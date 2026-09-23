import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import {
  updatePowerPrompterDocumentSession,
  type PowerPrompterDocumentSessionEnvelope,
} from './powerPrompterSessionApi';

type SessionUpdateInput = Parameters<typeof updatePowerPrompterDocumentSession>[0];
type SessionDispatch = (input: SessionUpdateInput) => Promise<PowerPrompterDocumentSessionEnvelope>;

export function createPowerPrompterSessionMutationQueue(
  getRevision: () => number,
  setRevision: (revision: number) => void,
  getClientId: () => string,
  dispatch: SessionDispatch = updatePowerPrompterDocumentSession,
) {
  let tail: Promise<void> = Promise.resolve();
  let latestUpdate = 0;

  const run = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = tail.then(action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const send = async (file: string, document: PowerPrompterCardDocument, save: boolean, intent: string) => {
    const payload = await dispatch({
      file,
      document,
      clientId: getClientId(),
      expectedRevision: getRevision(),
      save,
      intent,
    });
    if (payload.session) setRevision(payload.session.revision);
    return payload;
  };

  return {
    invalidatePendingUpdates() {
      latestUpdate += 1;
    },
    update(file: string, document: PowerPrompterCardDocument): Promise<PowerPrompterDocumentSessionEnvelope | null> {
      const updateId = ++latestUpdate;
      return run(() => updateId === latestUpdate ? send(file, document, false, 'session-update') : Promise.resolve(null));
    },
    save(file: string, document: PowerPrompterCardDocument, intent: string): Promise<PowerPrompterDocumentSessionEnvelope> {
      latestUpdate += 1;
      return run(() => send(file, document, true, intent));
    },
  };
}
