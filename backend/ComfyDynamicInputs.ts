type Descriptor = [unknown, Record<string, any>?];
type InputGroups = { required?: Record<string, Descriptor>; optional?: Record<string, Descriptor> };

// Comfy v3 serializes dynamic collections as dotted input names, rather than
// submitting the collection widget itself. Mirror its schema expansion before
// checking required inputs, resources, ranges and linked output slots.
export function expandComfyRuntimeInputs(groups: InputGroups, values: Record<string, unknown>): InputGroups {
  const result = { required: {} as Record<string, Descriptor>, optional: {} as Record<string, Descriptor> };
  const expand = (inputs: InputGroups, prefix = '', depth = 0) => {
    if (depth > 16) throw new Error('ComfyUI dynamic input schema is too deeply nested.');
    for (const kind of ['required', 'optional'] as const) {
      for (const [name, descriptor] of Object.entries(inputs[kind] || {})) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (descriptor[0] === 'COMFY_AUTOGROW_V3') {
          const template = descriptor[1]?.template;
          const required = Object.values(template?.input?.required || {}) as Descriptor[];
          const optional = Object.values(template?.input?.optional || {}) as Descriptor[];
          const child = required[0] || optional[0];
          const names = Array.isArray(template?.names) ? template.names : typeof template?.prefix === 'string'
            && Number.isInteger(template.max) && template.max >= 1 && template.max <= 100
            ? Array.from({ length: template.max }, (_, index) => `${template.prefix}${index}`) : null;
          if (!child || !names || names.length > 100 || names.some((entry: unknown) => typeof entry !== 'string')
            || !Number.isInteger(template.min) || template.min < 0 || template.min > names.length) {
            throw new Error(`ComfyUI dynamic input ${key} has an unsupported template.`);
          }
          names.forEach((entry: string, index: number) => {
            result[required.length && index < template.min ? 'required' : 'optional'][`${key}.${entry}`] = child;
          });
        } else if (descriptor[0] === 'COMFY_DYNAMICCOMBO_V3') {
          const options = descriptor[1]?.options;
          if (!Array.isArray(options)) throw new Error(`ComfyUI dynamic selector ${key} has no options.`);
          result[kind][key] = ['COMBO', { options: options.map(option => option.key) }];
          if (!Object.hasOwn(values, key)) continue;
          const selected = options.find(option => option.key === values[key]);
          if (!selected) throw new Error(`ComfyUI dynamic selector ${key} has an unavailable option.`);
          expand(selected.inputs || {}, key, depth + 1);
        } else {
          result[kind][key] = descriptor;
        }
      }
    }
  };
  expand(groups);
  return result;
}
