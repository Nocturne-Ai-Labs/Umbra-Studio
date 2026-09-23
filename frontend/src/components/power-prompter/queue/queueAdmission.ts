import { createRequestId, isLocalStagedQueueRequestId } from './queueCore';

type QueueAdmissionFailureOutcome = 'not-sent' | 'rejected';
type QueueAdmissionFailure = Error & { admissionOutcome?: QueueAdmissionFailureOutcome };

export function createQueueAdmissionFailure(message: string, admissionOutcome: QueueAdmissionFailureOutcome): Error {
  const error: QueueAdmissionFailure = new Error(message);
  error.admissionOutcome = admissionOutcome;
  return error;
}

export function isQueueAdmissionOutcomeUncertain(error: unknown, submissionStarted: boolean): boolean {
  if (!submissionStarted) return false;
  const outcome = error && typeof error === 'object'
    ? (error as QueueAdmissionFailure).admissionOutcome
    : undefined;
  return outcome !== 'not-sent' && outcome !== 'rejected';
}

export function isProtectedLocalQueueRequestId(requestId: string, attemptedLiveRequestIds: ReadonlySet<string>): boolean {
  return isLocalStagedQueueRequestId(requestId) || attemptedLiveRequestIds.has(requestId);
}

/** Keep an attempted group ID stable until admission is known, including after a lost ACK. */
export function reserveQueueAdmissionRequestId(
  sourceRequestId: string,
  attemptedLiveRequestIds: Set<string>,
  allocateRequestId: () => string = createRequestId,
): string {
  if (!isLocalStagedQueueRequestId(sourceRequestId) && attemptedLiveRequestIds.has(sourceRequestId)) {
    return sourceRequestId;
  }
  const liveRequestId = allocateRequestId();
  attemptedLiveRequestIds.add(liveRequestId);
  return liveRequestId;
}

export function hasObservedQueueAdmission(
  attemptedRequestIds: readonly string[],
  backendRequestIds: ReadonlySet<string>,
): boolean {
  return attemptedRequestIds.length > 0
    && attemptedRequestIds.every((requestId) => backendRequestIds.has(requestId));
}

export function recordObservedQueueAdmissions(
  attemptedRequestIds: ReadonlySet<string>,
  snapshotRequestIds: Iterable<string>,
  observedRequestIds: Set<string>,
): void {
  for (const requestId of snapshotRequestIds) {
    if (attemptedRequestIds.has(requestId)) observedRequestIds.add(requestId);
  }
}

export function shouldHoldQueueAdmissionRetry(
  uncertainRequestIds: ReadonlySet<string>,
  backendRequestIds: ReadonlySet<string>,
): boolean {
  return uncertainRequestIds.size > 0
    && !hasObservedQueueAdmission(Array.from(uncertainRequestIds), backendRequestIds);
}
