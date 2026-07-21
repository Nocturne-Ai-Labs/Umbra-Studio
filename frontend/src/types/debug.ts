// Debug Telemetry Type Definitions

export type LogLevel = 'verbose' | 'normal' | 'minimal';
export type EventCategory =
  | 'cursor'
  | 'click'
  | 'keyboard'
  | 'animation'
  | 'render'
  | 'state'
  | 'network'
  | 'performance'
  | 'error'
  | 'lifecycle';

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  category: EventCategory;
  type: string;
  data: Record<string, any>;
  component?: string;
  stackTrace?: string;
}

export interface CursorEvent extends TelemetryEvent {
  category: 'cursor';
  data: {
    x: number;
    y: number;
    velocityX?: number;
    velocityY?: number;
    target?: string;
    elementPath?: string;
  };
}

export interface ClickEvent extends TelemetryEvent {
  category: 'click';
  data: {
    x: number;
    y: number;
    button: number;
    target: string;
    elementPath: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  };
}

export interface AnimationEvent extends TelemetryEvent {
  category: 'animation';
  data: {
    name: string;
    phase: 'start' | 'update' | 'complete' | 'cancel';
    duration?: number;
    element?: string;
    properties?: string[];
  };
}

export interface RenderEvent extends TelemetryEvent {
  category: 'render';
  data: {
    component: string;
    renderTime: number;
    propsChanged?: string[];
    stateChanged?: boolean;
    renderCount?: number;
  };
}

export interface StateEvent extends TelemetryEvent {
  category: 'state';
  data: {
    store: string;
    action: string;
    before: any;
    after: any;
    diff?: any;
  };
}

export interface NetworkEvent extends TelemetryEvent {
  category: 'network';
  data: {
    method: string;
    url: string;
    status?: number;
    duration?: number;
    requestSize?: number;
    responseSize?: number;
    error?: string;
  };
}

export interface PerformanceEvent extends TelemetryEvent {
  category: 'performance';
  data: {
    metric: 'fps' | 'memory' | 'longtask' | 'layoutshift';
    value: number;
    threshold?: number;
    exceeded?: boolean;
  };
}

export interface DebugConfig {
  enabled: boolean;
  verbosity: LogLevel;
  trackCursor: boolean;
  trackAnimations: boolean;
  trackState: boolean;
  trackNetwork: boolean;
  trackPerformance: boolean;
  showOverlay: boolean;
  exportOnError: boolean;
  maxEvents: number; // Buffer size
  cursorSampleRate: number; // ms between cursor samples
  fileLogging: boolean; // NEW: Enable live file logging to disk
  fileLogBatchSize: number; // NEW: How many events to batch before sending to backend
}

export interface DebugSession {
  id: string;
  startTime: number;
  endTime?: number;
  userAgent: string;
  viewport: { width: number; height: number };
  events: TelemetryEvent[];
  errors: Error[];
  performance: {
    avgFps: number;
    maxMemory: number;
    longTasks: number;
  };
}

export interface DebugStore {
  config: DebugConfig;
  session: DebugSession | null;
  events: TelemetryEvent[];
  isRecording: boolean;
  overlayVisible: boolean;

  // Actions
  startSession: () => void;
  endSession: () => void;
  logEvent: (event: Omit<TelemetryEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;
  exportSession: () => string;
  toggleOverlay: () => void;
  updateConfig: (config: Partial<DebugConfig>) => void;
}

export type DebugEventHandler = (event: TelemetryEvent) => void;
