// Keep this dependency-free and first in every browser entry: imported modules can
// use these built-ins during evaluation, before the entry's body runs.
function install(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: false });
}

function requireReceiver(value: unknown): void {
  if (value === null || value === undefined) throw new TypeError('Missing receiver');
}

function relativeIndex(index: unknown, length: number): number {
  // Unary + implements ToNumber (unlike Number(), it rejects bigint).
  const number = +(index as number);
  const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
  return integer < 0 ? length + integer : integer;
}

function arrayAt(this: ArrayLike<unknown>, index: number): unknown {
  requireReceiver(this);
  const length = Math.min(Math.max(Math.trunc(+this.length) || 0, 0), Number.MAX_SAFE_INTEGER);
  const offset = relativeIndex(index, length);
  return offset >= 0 && offset < length ? this[offset] : undefined;
}

function dataCloneError(): DOMException {
  return new DOMException('This value cannot be cloned by the compatibility fallback', 'DataCloneError');
}

/**
 * The app clones DTOs (including frozen arrays) and simulation-history Maps.
 * Keep aliases/cycles, but discard prototypes, descriptors, symbols and hidden
 * properties just as structuredClone does. Functions/symbol values must throw,
 * not silently disappear as with JSON. No caller uses transfers or other hosts.
 */
function cloneData<T>(value: T, options?: StructuredSerializeOptions): T {
  if (options?.transfer && Array.from(options.transfer).length > 0) throw dataCloneError();
  const seen = new Map<object, object>();
  const clone = (input: unknown): unknown => {
    if (typeof input === 'function' || typeof input === 'symbol') throw dataCloneError();
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return seen.get(input);

    if (input instanceof Map) {
      const output = new Map<unknown, unknown>();
      seen.set(input, output);
      for (const [key, entry] of input) output.set(clone(key), clone(entry));
      return output;
    }

    if (!Array.isArray(input) && Object.prototype.toString.call(input) !== '[object Object]') {
      throw dataCloneError();
    }
    const output: Record<string, unknown> | unknown[] = Array.isArray(input) ? new Array(input.length) : {};
    seen.set(input, output);
    for (const key of Object.keys(input)) {
      Object.defineProperty(output, key, {
        value: clone((input as Record<string, unknown>)[key]),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    return output;
  };
  return clone(value) as T;
}

export function installPolyfills(): void {
  if (typeof Object.hasOwn !== 'function') {
    install(Object, 'hasOwn', function hasOwn(object: unknown, key: PropertyKey): boolean {
      requireReceiver(object);
      // biome-ignore lint/suspicious/noPrototypeBuiltins: this is the Object.hasOwn polyfill itself.
      return Object.prototype.hasOwnProperty.call(object, key);
    });
  }
  if (typeof Array.prototype.at !== 'function') {
    install(Array.prototype, 'at', arrayAt);
    // Array methods excluded from `with` scopes include at on native engines.
    Array.prototype[Symbol.unscopables].at = true;
  }
  if (typeof globalThis.structuredClone !== 'function') install(globalThis, 'structuredClone', cloneData);

  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
    install(crypto, 'randomUUID', function randomUUID(this: Crypto): string {
      const bytes = this.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    });
  }
}

installPolyfills();
